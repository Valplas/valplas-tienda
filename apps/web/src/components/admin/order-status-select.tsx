'use client';

import { OrderStatus } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface OrderStatusSelectProps {
  currentStatus: OrderStatus;
  validStatuses: OrderStatus[];
  onStatusChange: (status: OrderStatus) => void;
  disabled?: boolean;
}

const statusConfig: Record<
  OrderStatus,
  {
    label: string;
    color: string;
  }
> = {
  [OrderStatus.PENDING]: {
    label: 'Pendiente',
    color: 'text-yellow-700'
  },
  [OrderStatus.PROCESSING]: {
    label: 'En proceso',
    color: 'text-blue-700'
  },
  [OrderStatus.SHIPPED]: {
    label: 'Enviado',
    color: 'text-purple-700'
  },
  [OrderStatus.DELIVERED]: {
    label: 'Entregado',
    color: 'text-green-700'
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelado',
    color: 'text-red-700'
  }
};

export function OrderStatusSelect({
  currentStatus,
  validStatuses,
  onStatusChange,
  disabled
}: OrderStatusSelectProps) {
  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => onStatusChange(value as OrderStatus)}
      disabled={disabled || validStatuses.length === 0}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Current status (always shown) */}
        <SelectItem value={currentStatus} disabled className={statusConfig[currentStatus].color}>
          {statusConfig[currentStatus].label} (actual)
        </SelectItem>

        {/* Valid next statuses */}
        {validStatuses.map((status) => (
          <SelectItem key={status} value={status} className={statusConfig[status].color}>
            {statusConfig[status].label}
          </SelectItem>
        ))}

        {/* Message if no valid transitions */}
        {validStatuses.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No hay transiciones disponibles
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
