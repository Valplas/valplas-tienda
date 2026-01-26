/**
 * Add to Cart Button Component
 * Button with loading state and toast feedback
 */

'use client';

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';

interface AddToCartButtonProps {
  productId: string;
  productName: string;
  quantity?: number;
  disabled?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  className?: string;
  children?: string;
}

export function AddToCartButton({
  productId,
  productName,
  quantity = 1,
  disabled = false,
  size = 'default',
  variant = 'default',
  className,
  children
}: AddToCartButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = async () => {
    setIsLoading(true);

    try {
      await addItem(productId, quantity);

      toast.success('Producto agregado', {
        description: `${productName} (x${quantity}) se agregó al carrito`
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
    <Button
      onClick={handleAddToCart}
      disabled={disabled || isLoading}
      size={size}
      variant={variant}
      className={cn('gap-2', className)}
    >
      <ShoppingCart className="h-4 w-4" />
      {children || (isLoading ? 'Agregando...' : 'Agregar al Carrito')}
    </Button>
  );
}
