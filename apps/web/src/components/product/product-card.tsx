/**
 * Product Card Component
 * Card for grid display with image, name, price, stock badge, and add to cart
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Product } from '@/types';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { StockBadge } from './stock-badge';
import { AddToCartButton } from './add-to-cart-button';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const isOutOfStock = product.available_stock === 0;

  return (
    <Card className={cn('group overflow-hidden transition-shadow hover:shadow-lg', className)}>
      {/* Image */}
      <Link href={`/productos/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
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
          {product.is_featured && (
            <div className="absolute left-2 top-2 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
              Destacado
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <CardContent className="p-4">
        <Link href={`/productos/${product.slug}`} className="block space-y-2">
          {/* Brand */}
          {product.brand && <p className="text-xs text-muted-foreground">{product.brand.name}</p>}

          {/* Name */}
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
            {product.name}
          </h3>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold">{formatPrice(product.final_price)}</p>
            {product.final_price < product.base_price && (
              <p className="text-xs text-muted-foreground line-through">
                {formatPrice(product.base_price)}
              </p>
            )}
          </div>

          {/* Unit */}
          <p className="text-xs text-muted-foreground">{product.unit}</p>
        </Link>

        {/* Stock Badge */}
        <div className="mt-3">
          <StockBadge stock={product.available_stock} />
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="p-4 pt-0">
        <AddToCartButton
          productId={product.id}
          productName={product.name}
          disabled={isOutOfStock}
          className="w-full"
          size="sm"
        />
      </CardFooter>
    </Card>
  );
}
