/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payment Step Component
 * Step 3: Order review and payment
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatPrice } from '@/lib/formatters';
import { Address, ShippingOption, CartItem } from '@/types';
import { Loader2, CreditCard } from 'lucide-react';
import { createOrder } from '@/services';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface PaymentStepProps {
  items: CartItem[];
  shippingAddress: Address;
  shippingOption: ShippingOption;
  subtotal: number;
  isAuthenticated: boolean;
  userId?: string;
  onBack: () => void;
}

const FREE_SHIPPING_THRESHOLD = 10000;

export function PaymentStep({
  items,
  shippingAddress,
  shippingOption,
  subtotal,
  isAuthenticated,
  userId,
  onBack
}: PaymentStepProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [dni, setDni] = useState('');

  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingCost = isFreeShipping ? 0 : shippingOption.cost;
  const total = subtotal + shippingCost;

  const handlePayment = async () => {
    if (!isAuthenticated) {
      toast.error('Debés iniciar sesión para continuar');
      return;
    }

    if (!userId) {
      toast.error('Error de autenticación');
      return;
    }

    setIsProcessing(true);

    try {
      const orderData = {
        shippingAddressId: shippingAddress.id,
        carrierId: shippingOption.carrierId,
        paymentMethod: 'mercadopago' as const,
        items: items
          .filter((item) => item.productId)
          .map((item) => ({ productId: item.productId, quantity: item.quantity })),
        payerIdentification: dni.trim() ? { type: 'DNI', number: dni.trim() } : undefined
      };

      const response = await createOrder(orderData);

      if (response.success && response.data) {
        if (response.data.paymentUrl) {
          window.location.href = response.data.paymentUrl;
        } else {
          toast.success('¡Pedido creado exitosamente!');
          router.push('/cuenta/pedidos');
        }
      } else {
        throw new Error(response.error?.message || 'Error al crear el pedido');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al procesar el pago');
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Revisá tu pedido</h2>
        <p className="text-muted-foreground text-sm">
          Verificá que todo esté correcto antes de confirmar
        </p>
      </div>

      {/* Order Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Productos ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => {
              const product = item.product;
              if (!product) return null;

              return (
                <div key={item.productId} className="flex justify-between text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-muted-foreground">
                      {item.quantity} x {formatPrice(product.finalPrice)}
                    </div>
                  </div>
                  <div className="font-medium">
                    {formatPrice(product.finalPrice * item.quantity)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Shipping Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dirección de envío</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div className="font-medium">{shippingAddress.label}</div>
              <div>
                {shippingAddress.street} {shippingAddress.streetNumber}
                {shippingAddress.floor && `, Piso ${shippingAddress.floor}`}
                {shippingAddress.apartment && ` Dpto ${shippingAddress.apartment}`}
              </div>
              <div>
                {shippingAddress.city}, {shippingAddress.province}
              </div>
              <div>CP {shippingAddress.postcode}</div>
            </div>

            <Separator className="my-4" />

            <div className="text-sm">
              <div className="font-medium mb-1">Método de envío</div>
              <div className="text-muted-foreground">{shippingOption.carrierName}</div>
              <div className="text-muted-foreground text-xs">
                Entrega en {shippingOption.estimatedDays}{' '}
                {shippingOption.estimatedDays === 1 ? 'día hábil' : 'días hábiles'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Envío</span>
              {isFreeShipping ? (
                <span className="font-medium text-green-600">Gratis</span>
              ) : (
                <span className="font-medium">{formatPrice(shippingCost)}</span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication Check */}
      {!isAuthenticated && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardContent className="p-6">
            <p className="font-medium mb-3">Creá una cuenta o iniciá sesión para continuar</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild variant="default">
                <Link href="/login?redirect=/checkout">Iniciar sesión</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/registro?redirect=/checkout">Registrarme</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DNI para mejora de aprobación */}
      {isAuthenticated && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Label htmlFor="dni" className="text-sm font-medium">
              DNI (opcional — mejora la aprobación del pago)
            </Label>
            <Input
              id="dni"
              type="text"
              inputMode="numeric"
              placeholder="Ej: 30123456"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              disabled={isProcessing}
            />
          </CardContent>
        </Card>
      )}

      {/* Payment Button */}
      {isAuthenticated && (
        <Card>
          <CardContent className="p-6">
            <Button size="lg" className="w-full" onClick={handlePayment} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Procesando pago...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-5 w-5" />
                  Pagar con Mercado Pago
                </>
              )}
            </Button>
            <div className="flex items-center justify-center gap-2 mt-4">
              <img
                src="https://imgmp.mlstatic.com/org-img/banners/ar/medios/120X60.jpg"
                alt="Mercado Pago - Medios de pago"
                width={120}
                height={60}
                className="rounded"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Al confirmar, aceptás nuestros términos y condiciones
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={isProcessing}>
          Volver
        </Button>
      </div>
    </div>
  );
}
