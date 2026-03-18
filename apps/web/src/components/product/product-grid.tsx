/**
 * Product Grid Component
 * Responsive grid layout for products
 * Mobile: 1 col, Tablet: 2 cols, Desktop: 3 cols, Large: 4 cols
 */

import { ProductPublic } from '@/types';
import { ProductCard } from './product-card';
import { cn } from '@/lib/utils';

interface ProductGridProps {
  products: ProductPublic[];
  className?: string;
}

export function ProductGrid({ products, className }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <p className="text-lg font-semibold">No se encontraron productos</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Intenta ajustar los filtros de búsqueda
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
        className
      )}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
