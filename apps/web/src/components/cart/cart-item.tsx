/**
 * Cart Item Component
 * Individual cart item with image, quantity selector, and remove button
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { formatPrice } from '@/lib/formatters';
import { useCartStore } from '@/stores/cart-store';
import { toast } from 'sonner';
import { useState } from 'react';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore();
  const [isRemoving, setIsRemoving] = useState(false);

  const product = item.product;

  if (!product) {
    return null;
  }

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity === item.quantity) return;

    try {
      await updateQuantity(product.id, newQuantity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar cantidad');
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeItem(product.id);
      toast.success('Producto eliminado del carrito');
    } catch {
      toast.error('Error al eliminar producto');
      setIsRemoving(false);
    }
  };

  const itemSubtotal = product.finalPrice * item.quantity;

  return (
    <div className="flex gap-4 py-4 border-b last:border-0">
      {/* Product Image */}
      <Link
        href={`/productos/${product.slug}`}
        className="relative w-20 h-20 shrink-0 rounded-md overflow-hidden bg-muted"
      >
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="object-cover"
          sizes="80px"
        />
      </Link>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/productos/${product.slug}`}
          className="font-medium hover:underline line-clamp-2 text-sm"
        >
          {product.name}
        </Link>

        <p className="text-sm text-muted-foreground mt-1">{product.unit}</p>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm font-semibold">{formatPrice(product.finalPrice)}</span>
          {product.basePrice > product.finalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.basePrice)}
            </span>
          )}
        </div>

        {/* Mobile: Quantity + Total */}
        <div className="mt-3 flex items-center justify-between md:hidden">
          <QuantitySelector
            value={item.quantity}
            max={product.availableStock}
            onChange={handleQuantityChange}
            className="scale-90 origin-left"
          />
          <span className="font-semibold text-sm">{formatPrice(itemSubtotal)}</span>
        </div>
      </div>

      {/* Desktop: Quantity */}
      <div className="hidden md:flex items-center">
        <QuantitySelector
          value={item.quantity}
          max={product.availableStock}
          onChange={handleQuantityChange}
        />
      </div>

      {/* Desktop: Subtotal */}
      <div className="hidden md:flex items-center min-w-[100px] justify-end">
        <span className="font-semibold">{formatPrice(itemSubtotal)}</span>
      </div>

      {/* Remove Button */}
      <div className="flex items-start md:items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          disabled={isRemoving}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label="Eliminar producto"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
