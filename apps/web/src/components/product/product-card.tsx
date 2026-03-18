'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductPublic } from '@/types';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StockBadge } from './stock-badge';
import { formatPrice } from '@/lib/formatters';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductPublic;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [counter, setCounter] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const isOutOfStock = product.available_stock === 0;
  const hasTiers = product.tiers.length > 0;
  const hasMultipleTiers = product.tiers.length > 1;

  const selectedTier = hasTiers ? product.tiers[selectedTierIndex] : null;
  const unitPrice = hasTiers ? product.tiers[0].unit_price : product.base_price;
  const bulkTier = hasMultipleTiers ? product.tiers[product.tiers.length - 1] : null;

  const handleTierSelect = (index: number) => {
    setSelectedTierIndex(index);
    setCounter(1);
  };

  const handleDecrement = () => setCounter((c) => Math.max(1, c - 1));
  const handleIncrement = () => {
    const presentation = selectedTier?.min_quantity ?? 1;
    const maxCounter = Math.floor(product.available_stock / presentation);
    setCounter((c) => Math.min(c + 1, maxCounter));
  };

  const handleAddToCart = async () => {
    const presentation = selectedTier?.min_quantity ?? 1;
    const totalQuantity = presentation * counter;

    setIsLoading(true);
    try {
      await addItem(product.id, totalQuantity);
      toast.success('Producto agregado', {
        description: `${product.name} (x${totalQuantity}) se agregó al carrito`
      });
    } catch (error) {
      toast.error('Error al agregar', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      {/* Imagen */}
      <Link href={`/productos/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover transition-transform hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <svg
                className="h-16 w-16 text-muted-foreground/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        {/* Nombre */}
        <Link href={`/productos/${product.slug}`}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight hover:text-primary">
            {product.name}
          </h3>
        </Link>

        {/* Stock + SKU */}
        <div className="flex items-center gap-2">
          <StockBadge stock={product.available_stock} />
          <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
        </div>

        {/* Precios */}
        <div className="space-y-0.5">
          {bulkTier && (
            <div>
              <p className="text-xs text-muted-foreground">Precio unitario por bulto cerrado:</p>
              <p className="text-base font-bold">{formatPrice(bulkTier.unit_price / 100)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Precio unitario:</p>
            <p className={cn('font-semibold', bulkTier ? 'text-sm' : 'text-base font-bold')}>
              {formatPrice(unitPrice / 100)}
            </p>
          </div>
        </div>

        {/* Selector de presentación */}
        {hasMultipleTiers && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Presentación
            </p>
            <div className="flex flex-wrap gap-1.5">
              {product.tiers.map((tier, index) => (
                <button
                  key={tier.min_quantity}
                  onClick={() => handleTierSelect(index)}
                  className={cn(
                    'min-w-[2.5rem] rounded border px-2 py-1 text-sm font-medium transition-colors',
                    selectedTierIndex === index
                      ? 'border-destructive bg-destructive/5 text-destructive'
                      : 'border-muted-foreground/30 hover:border-muted-foreground'
                  )}
                >
                  {tier.min_quantity}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer: contador + carrito */}
      <CardFooter className="gap-2 p-3 pt-0">
        <div className="flex items-center gap-1 rounded border">
          <button
            onClick={handleDecrement}
            disabled={counter <= 1 || isOutOfStock}
            className="px-2 py-1 text-sm disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[1.5rem] text-center text-sm">{counter}</span>
          <button
            onClick={handleIncrement}
            disabled={isOutOfStock}
            className="px-2 py-1 text-sm disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <Button
          onClick={handleAddToCart}
          disabled={isOutOfStock || isLoading}
          size="sm"
          className="flex-1"
        >
          <ShoppingCart className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
