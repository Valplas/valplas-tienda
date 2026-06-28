/**
 * Checkout Page Component
 * Multi-step checkout flow
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';
import { CheckoutStepper } from './checkout-stepper';
import { AddressStep } from './address-step';
import { ShippingStep } from './shipping-step';
import { PaymentStep } from './payment-step';
import { EmptyCart } from '@/components/cart/empty-cart';
import { Address, ShippingOption } from '@/types';
import { AddressFormData } from '@/lib/validations/checkout';

const STEPS = ['Dirección', 'Envío', 'Pago'];

interface CheckoutPageProps {
  savedAddresses?: Address[];
}

export function CheckoutPage({ savedAddresses = [] }: CheckoutPageProps) {
  const router = useRouter();
  const { items, itemCount, subtotal } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();
  const userId = user?.id;
  const [currentStep, setCurrentStep] = useState(1);
  const [shippingAddress, setShippingAddress] = useState<Address | AddressFormData | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);

  // Redirect to cart if empty
  useEffect(() => {
    if (itemCount === 0) {
      router.push('/carrito');
    }
  }, [itemCount, router]);

  if (items.length === 0) {
    return (
      <div className="container max-w-4xl py-8">
        <EmptyCart />
      </div>
    );
  }

  const handleAddressNext = (address: Address | AddressFormData) => {
    setShippingAddress(address);
    setCurrentStep(2);
  };

  const handleShippingNext = (option: ShippingOption) => {
    setShippingOption(option);
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Helper to get postcode from address
  const getPostcode = (): string => {
    if (!shippingAddress) return '';
    return 'postcode' in shippingAddress ? shippingAddress.postcode : '';
  };

  // Helper to convert AddressFormData to Address
  const getFullAddress = (): Address => {
    if (!shippingAddress) {
      throw new Error('No shipping address');
    }

    if ('id' in shippingAddress) {
      return shippingAddress as Address;
    }

    // Convert AddressFormData to Address
    return {
      ...shippingAddress,
      id: 'temp-address',
      userId: userId || 'guest',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as Address;
  };

  return (
    <div className="container max-w-4xl px-4 py-4 sm:py-8">
      <h1 className="text-xl font-bold mb-2 sm:text-2xl">Checkout</h1>
      <p className="text-muted-foreground mb-6">Completá tu compra en 3 simples pasos</p>

      {/* Stepper */}
      <CheckoutStepper currentStep={currentStep} steps={STEPS} />

      {/* Step Content */}
      <div className="mt-8">
        {currentStep === 1 && (
          <AddressStep savedAddresses={savedAddresses} onNext={handleAddressNext} />
        )}

        {currentStep === 2 && shippingAddress && (
          <ShippingStep
            postcode={getPostcode()}
            cartTotal={subtotal}
            onNext={handleShippingNext}
            onBack={handleBack}
          />
        )}

        {currentStep === 3 && shippingAddress && shippingOption && (
          <PaymentStep
            items={items}
            shippingAddress={getFullAddress()}
            shippingOption={shippingOption}
            subtotal={subtotal}
            isAuthenticated={isAuthenticated}
            userId={userId}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
