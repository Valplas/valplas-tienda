/**
 * Cart Summary Component
 * Shows subtotal, shipping, and total
 */

'use client';

import { formatPrice } from '@/lib/formatters';
import { Separator } from '@/components/ui/separator';

interface CartSummaryProps {
  subtotal: number;
  shippingCost?: number;
  showShipping?: boolean;
}

const FREE_SHIPPING_THRESHOLD = 10000; // $10,000 ARS

export function CartSummary({
  subtotal,
  shippingCost = 0,
  showShipping = false
}: CartSummaryProps) {
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const displayShippingCost = isFreeShipping ? 0 : shippingCost;
  const total = subtotal + displayShippingCost;

  return (
    <div className="space-y-3">
      {/* Subtotal */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{formatPrice(subtotal)}</span>
      </div>

      {/* Shipping */}
      {showShipping && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Envío</span>
          {isFreeShipping ? (
            <span className="font-medium text-green-600">Gratis</span>
          ) : shippingCost > 0 ? (
            <span className="font-medium">{formatPrice(shippingCost)}</span>
          ) : (
            <span className="text-muted-foreground text-xs">A calcular</span>
          )}
        </div>
      )}

      {/* Free shipping progress */}
      {!showShipping && subtotal < FREE_SHIPPING_THRESHOLD && (
        <div className="text-xs text-muted-foreground">
          Te faltan {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} para envío gratis
        </div>
      )}

      <Separator />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <span className="font-bold text-lg">{formatPrice(total)}</span>
      </div>

      {/* Free shipping badge */}
      {isFreeShipping && showShipping && (
        <div className="text-xs text-green-600 text-center pt-1">¡Envío gratis aplicado!</div>
      )}
    </div>
  );
}
