/**
 * OrderStatusBadge Component
 * Badge to display order status with Spanish labels and colors
 */

import { OrderStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusConfig: Record<
  OrderStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
  }
> = {
  [OrderStatus.PENDING]: {
    label: 'Pendiente',
    variant: 'outline',
    className: 'border-yellow-500 text-yellow-700 bg-yellow-50'
  },
  [OrderStatus.PROCESSING]: {
    label: 'En proceso',
    variant: 'default',
    className: 'bg-blue-500 hover:bg-blue-600'
  },
  [OrderStatus.SHIPPED]: {
    label: 'Enviado',
    variant: 'default',
    className: 'bg-purple-500 hover:bg-purple-600'
  },
  [OrderStatus.DELIVERED]: {
    label: 'Entregado',
    variant: 'default',
    className: 'bg-green-500 hover:bg-green-600'
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelado',
    variant: 'destructive',
    className: 'bg-red-500 hover:bg-red-600'
  }
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
