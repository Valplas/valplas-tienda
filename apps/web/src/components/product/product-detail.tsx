/**
 * Product Detail Component
 * Complete product information with gallery, name, price, description, and actions
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Product } from '@/types';
import { ProductGallery } from './product-gallery';
import { StockBadge } from './stock-badge';
import { QuantitySelector } from './quantity-selector';
import { AddToCartButton } from './add-to-cart-button';
import { formatPrice } from '@/lib/formatters';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface ProductDetailProps {
  product: Product;
  className?: string;
}

export function ProductDetail({ product, className }: ProductDetailProps) {
  const [quantity, setQuantity] = useState(1);
  const isOutOfStock = product.available_stock === 0;
  const maxQuantity = Math.min(product.available_stock, 999);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Inicio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {product.category && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/productos?category_id=${product.category.id}`}>
                    {product.category.name}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Product Info Grid */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <ProductGallery images={product.images} productName={product.name} />

        {/* Info */}
        <div className="space-y-6">
          {/* Brand */}
          {product.brand && (
            <div>
              <Link
                href={`/productos?brand_id=${product.brand.id}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {product.brand.name}
              </Link>
            </div>
          )}

          {/* Name */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">SKU: {product.sku}</p>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold">{formatPrice(product.final_price)}</p>
              {product.final_price < product.base_price && (
                <p className="text-lg text-muted-foreground line-through">
                  {formatPrice(product.base_price)}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Precio por {product.unit}</p>
          </div>

          {/* Stock */}
          <div>
            <StockBadge stock={product.available_stock} />
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h2 className="mb-2 text-lg font-semibold">Descripción</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          </div>

          <Separator />

          {/* Quantity & Add to Cart */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cantidad</label>
              <QuantitySelector value={quantity} min={1} max={maxQuantity} onChange={setQuantity} />
            </div>

            <AddToCartButton
              productId={product.id}
              productName={product.name}
              quantity={quantity}
              disabled={isOutOfStock}
              className="w-full"
              size="lg"
            />

            {isOutOfStock && (
              <p className="text-center text-sm text-muted-foreground">
                Producto sin stock disponible
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
