/**
 * Checkout Page Component
 * Multi-step checkout flow. Requiere sesión iniciada antes de empezar
 * (si no, redirige a /login?redirect=/checkout). Carga las direcciones
 * guardadas del usuario y trabaja siempre con direcciones persistidas.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAddresses, type Address } from '@/lib/services/addresses.service';
import { CheckoutStepper } from './checkout-stepper';
import { AddressStep } from './address-step';
import { ShippingStep } from './shipping-step';
import { PaymentStep } from './payment-step';
import { EmptyCart } from '@/components/cart/empty-cart';
import { ShippingOption } from '@/types';

const STEPS = ['Dirección', 'Envío', 'Pago'];

export function CheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal } = useCartStore();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const userId = user?.id;

  const [currentStep, setCurrentStep] = useState(1);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [shippingAddress, setShippingAddress] = useState<Address | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);

  // Gate: requiere sesión iniciada antes de empezar el checkout.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/checkout');
    }
  }, [authLoading, isAuthenticated, router]);

  // Redirige al carrito si está vacío.
  useEffect(() => {
    if (itemCount === 0) {
      router.push('/carrito');
    }
  }, [itemCount, router]);

  // Carga las direcciones guardadas del usuario.
  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    getUserAddresses()
      .then((res) => {
        if (!active) return;
        setSavedAddresses(res.success && res.data ? res.data : []);
      })
      .catch(() => {
        if (active) setSavedAddresses([]);
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Mientras resuelve auth o no está autenticado (antes del redirect), loader.
  if (authLoading || !isAuthenticated) {
    return (
      <div className="container max-w-4xl py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container max-w-4xl py-8">
        <EmptyCart />
      </div>
    );
  }

  const handleAddressNext = (address: Address) => {
    setShippingAddress(address);
    setCurrentStep(2);
  };

  const handleAddressSaved = (address: Address) => {
    setSavedAddresses((prev) => {
      const exists = prev.some((a) => a.id === address.id);
      return exists ? prev.map((a) => (a.id === address.id ? address : a)) : [...prev, address];
    });
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

  return (
    <div className="container max-w-4xl px-4 py-4 sm:py-8">
      <h1 className="text-xl font-bold mb-2 sm:text-2xl">Checkout</h1>
      <p className="text-muted-foreground mb-6">Completá tu compra en 3 simples pasos</p>

      {/* Stepper */}
      <CheckoutStepper currentStep={currentStep} steps={STEPS} />

      {/* Step Content */}
      <div className="mt-8">
        {currentStep === 1 &&
          (addressesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AddressStep
              savedAddresses={savedAddresses}
              onNext={handleAddressNext}
              onAddressSaved={handleAddressSaved}
            />
          ))}

        {currentStep === 2 && shippingAddress && (
          <ShippingStep
            postcode={shippingAddress.postcode}
            cartTotal={subtotal}
            onNext={handleShippingNext}
            onBack={handleBack}
          />
        )}

        {currentStep === 3 && shippingAddress && shippingOption && (
          <PaymentStep
            items={items}
            shippingAddress={shippingAddress}
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
