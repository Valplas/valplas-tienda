import type { ShipmentStatus } from './services/shipments.service';

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  requesting: 'Generando envío',
  pending: 'Pre-envío solicitado',
  created: 'Etiqueta lista',
  rejected: 'Rechazado por Andreani',
  in_transit: 'En camino',
  out_for_delivery: 'En distribución',
  ready_for_pickup: 'Listo para retirar en sucursal',
  delivery_failed: 'Visita sin éxito',
  delivered: 'Entregado',
  returning: 'En devolución',
  returned: 'Devuelto',
  incident: 'Incidente',
  cancelling: 'Cancelando',
  cancelled: 'Cancelado',
  error: 'Error',
  expired: 'Vencido'
};

export const SHIPMENT_ISSUE_STATUSES: readonly ShipmentStatus[] = [
  'rejected',
  'delivery_failed',
  'returning',
  'returned',
  'incident',
  'error',
  'expired'
];
