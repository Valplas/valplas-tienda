'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface OrderStatusSelectProps {
  currentStatus: string;
  validStatuses: string[];
  onStatusChange: (status: string) => void;
  disabled?: boolean;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: 'text-yellow-700' },
  payment_confirmed: { label: 'Pago confirmado', color: 'text-blue-500' },
  processing: { label: 'En proceso', color: 'text-blue-700' },
  ready_to_ship: { label: 'Listo para enviar', color: 'text-indigo-700' },
  shipped: { label: 'Enviado', color: 'text-purple-700' },
  delivered: { label: 'Entregado', color: 'text-green-700' },
  cancelled: { label: 'Cancelado', color: 'text-red-700' },
  refunded: { label: 'Reembolsado', color: 'text-gray-700' },
  failed: { label: 'Fallido', color: 'text-red-900' },
  // Legacy values
  pending: { label: 'Pendiente', color: 'text-yellow-700' }
};

function getStatusLabel(status: string) {
  return statusLabels[status]?.label ?? status;
}

function getStatusColor(status: string) {
  return statusLabels[status]?.color ?? 'text-foreground';
}

export function OrderStatusSelect({
  currentStatus,
  validStatuses,
  onStatusChange,
  disabled
}: OrderStatusSelectProps) {
  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => onStatusChange(value)}
      disabled={disabled || validStatuses.length === 0}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Current status (always shown, disabled) */}
        <SelectItem value={currentStatus} disabled className={getStatusColor(currentStatus)}>
          {getStatusLabel(currentStatus)} (actual)
        </SelectItem>

        {/* Valid next statuses */}
        {validStatuses.map((status) => (
          <SelectItem key={status} value={status} className={getStatusColor(status)}>
            {getStatusLabel(status)}
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
