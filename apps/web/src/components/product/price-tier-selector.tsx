'use client';

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCartStore } from '@/stores/cart-store';
import { formatPrice } from '@/lib/formatters';
import type { PriceTier } from '@/types';

interface PriceTierSelectorProps {
  productId: string;
  productName: string;
  tiers: PriceTier[];
  availableStock: number;
}

export function PriceTierSelector({
  productId,
  productName,
  tiers,
  availableStock
}: PriceTierSelectorProps) {
  const [selectedTierId, setSelectedTierId] = useState(tiers[0]?.priceListId ?? '');
  const [bundleCount, setBundleCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const selectedTier = tiers.find((t) => t.priceListId === selectedTierId) ?? tiers[0];

  if (!selectedTier) return null;

  const unitTier = tiers.find((t) => t.minQuantity === 1);
  const pricePerBundle = Math.trunc(selectedTier.unitPrice * selectedTier.minQuantity * 100) / 100;
  const subtotal = Math.trunc(pricePerBundle * bundleCount * 100) / 100;
  const totalUnits = bundleCount * selectedTier.minQuantity;
  const maxBundles = Math.floor(availableStock / selectedTier.minQuantity);

  const handleTierChange = (priceListId: string) => {
    setSelectedTierId(priceListId);
    setBundleCount(1);
  };

  const handleAddToCart = async () => {
    setIsLoading(true);
    try {
      await addItem(productId, bundleCount, selectedTierId);
      toast.success('Producto agregado', {
        description: `${productName} (${bundleCount} ${selectedTier.minQuantity > 1 ? `bultos × ${selectedTier.minQuantity}` : 'unidad'})`
      });
    } catch (error) {
      toast.error('Error al agregar producto', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tier selector */}
      <div>
        <p className="mb-2 text-sm font-medium">Comprar por:</p>
        <RadioGroup value={selectedTierId} onValueChange={handleTierChange} className="gap-2">
          {tiers.map((tier) => {
            const discount =
              unitTier && tier.priceListId !== unitTier.priceListId
                ? Math.round((1 - tier.unitPrice / unitTier.unitPrice) * 100)
                : null;
            const label =
              tier.minQuantity === 1 ? 'Unidad' : `${tier.priceListName} x${tier.minQuantity}`;

            return (
              <div
                key={tier.priceListId}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
              >
                <RadioGroupItem value={tier.priceListId} id={`tier-${tier.priceListId}`} />
                <Label
                  htmlFor={`tier-${tier.priceListId}`}
                  className="flex flex-1 cursor-pointer items-center justify-between"
                >
                  <span className="font-medium">{label}</span>
                  <span className="flex items-center gap-2">
                    <span>{formatPrice(tier.unitPrice)}/u</span>
                    {discount && discount > 0 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        -{discount}%
                      </span>
                    )}
                  </span>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      {/* Bundle count */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Cantidad de {selectedTier.minQuantity === 1 ? 'unidades' : 'bultos'}
        </label>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border">
            <button
              onClick={() => setBundleCount((c) => Math.max(1, c - 1))}
              disabled={bundleCount <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-l-md hover:bg-muted disabled:opacity-40"
            >
              −
            </button>
            <span className="flex h-9 min-w-[3rem] items-center justify-center text-sm font-medium">
              {bundleCount}
            </span>
            <button
              onClick={() => setBundleCount((c) => Math.min(maxBundles, c + 1))}
              disabled={bundleCount >= maxBundles}
              className="flex h-9 w-9 items-center justify-center rounded-r-md hover:bg-muted disabled:opacity-40"
            >
              +
            </button>
          </div>
          {selectedTier.minQuantity > 1 && (
            <span className="text-sm text-muted-foreground">= {totalUnits} unidades</span>
          )}
        </div>
      </div>

      {/* Price summary */}
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        {selectedTier.minQuantity > 1 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Precio por bulto</span>
            <span>{formatPrice(pricePerBundle)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
      </div>

      {/* Add to cart */}
      <Button
        onClick={handleAddToCart}
        disabled={isLoading || maxBundles === 0}
        size="lg"
        className="w-full gap-2"
      >
        <ShoppingCart className="h-4 w-4" />
        {isLoading ? 'Agregando...' : 'Agregar al Carrito'}
      </Button>

      {maxBundles === 0 && (
        <p className="text-center text-sm text-muted-foreground">Sin stock disponible</p>
      )}
    </div>
  );
}
