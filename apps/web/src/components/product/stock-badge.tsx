/**
 * Stock Badge Component
 * Shows availability with color coding
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StockBadgeProps {
  stock: number;
  className?: string;
}

export function StockBadge({ stock, className }: StockBadgeProps) {
  // Verde: stock > 10
  // Amarillo: stock 1-10
  // Rojo: stock = 0

  if (stock === 0) {
    return (
      <Badge variant="destructive" className={cn('text-xs', className)}>
        Sin stock
      </Badge>
    );
  }

  if (stock <= 10) {
    return (
      <Badge
        variant="secondary"
        className={cn('bg-yellow-500 text-white hover:bg-yellow-600 text-xs', className)}
      >
        Últimas {stock} unidades
      </Badge>
    );
  }

  return (
    <Badge variant="default" className={cn('bg-green-600 hover:bg-green-700 text-xs', className)}>
      Disponible
    </Badge>
  );
}
