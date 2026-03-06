/**
 * OrderStatusBadge Component
 * Badge to display order status with Spanish labels and colors
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

interface StatusConfig {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
}

const statusConfig: Record<string, StatusConfig> = {
  // Real API statuses
  pending_payment: {
    label: 'Pendiente de pago',
    variant: 'outline',
    className: 'border-yellow-500 text-yellow-700 bg-yellow-50'
  },
  payment_confirmed: {
    label: 'Pago confirmado',
    variant: 'default',
    className: 'bg-blue-400 hover:bg-blue-500'
  },
  processing: {
    label: 'En proceso',
    variant: 'default',
    className: 'bg-blue-500 hover:bg-blue-600'
  },
  ready_to_ship: {
    label: 'Listo para enviar',
    variant: 'default',
    className: 'bg-indigo-500 hover:bg-indigo-600'
  },
  shipped: {
    label: 'Enviado',
    variant: 'default',
    className: 'bg-purple-500 hover:bg-purple-600'
  },
  delivered: {
    label: 'Entregado',
    variant: 'default',
    className: 'bg-green-500 hover:bg-green-600'
  },
  cancelled: {
    label: 'Cancelado',
    variant: 'destructive',
    className: 'bg-red-500 hover:bg-red-600'
  },
  refunded: {
    label: 'Reembolsado',
    variant: 'secondary',
    className: 'bg-gray-500 hover:bg-gray-600 text-white'
  },
  failed: {
    label: 'Fallido',
    variant: 'destructive',
    className: 'bg-red-700 hover:bg-red-800'
  },
  // Legacy frontend enum values (kept for compatibility)
  pending: {
    label: 'Pendiente',
    variant: 'outline',
    className: 'border-yellow-500 text-yellow-700 bg-yellow-50'
  }
};

const defaultConfig: StatusConfig = {
  label: 'Desconocido',
  variant: 'secondary',
  className: ''
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const config = statusConfig[status] ?? defaultConfig;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
