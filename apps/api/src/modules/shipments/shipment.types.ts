import type { BranchSnapshot } from '../../infrastructure/external/andreani/branches.js';

export type ShipmentStatus =
  | 'requesting'
  | 'pending'
  | 'created'
  | 'rejected'
  | 'in_transit'
  | 'out_for_delivery'
  | 'ready_for_pickup'
  | 'delivery_failed'
  | 'delivered'
  | 'returning'
  | 'returned'
  | 'incident'
  | 'cancelling'
  | 'cancelled'
  | 'error'
  | 'expired';

export type ServiceType = 'home_delivery' | 'branch_pickup';
export type ShipmentChannel = 'B2C' | 'B2B';

export interface ShipmentPackage {
  kilos: number;
  volumeCm3: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
  declaredValue: number;
}

export interface PackageLine {
  productId: string;
  productName: string;
  realQuantity: number;
  weightKg: number | null;
  widthCm: number | null;
  lengthCm: number | null;
  heightCm: number | null;
}

/** Una fila de `shipments` (migración 053). */
export interface Shipment {
  id: string;
  order_id: string;
  carrier_code: string;
  service_type: ServiceType;
  contract: string | null;
  channel: ShipmentChannel | null;
  status: ShipmentStatus;
  tracking_number: string | null;
  group_number: string | null;
  andreani_state: string | null;
  destination_branch: BranchSnapshot | null;
  localidad: string | null;
  packages: ShipmentPackage[];
  request_payload: unknown | null;
  raw_response: unknown | null;
  quoted_price: number | null;
  label_url: string | null;
  last_event: string | null;
  last_event_at: Date | null;
  estimated_delivery_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  error_message: string | null;
  next_poll_at: Date | null;
  poll_failures: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Una fila de `shipment_events` (migración 053). */
export interface ShipmentEventRow {
  id: string;
  shipment_id: string;
  occurred_at: Date;
  cycle: string | null;
  event: string;
  reason: string | null;
  sub_reason: string | null;
  status_label: string | null;
  branch_name: string | null;
  branch_id: string | null;
  comment: string | null;
  source: 'pull' | 'push' | 'mock';
  raw: unknown | null;
  created_at: Date;
}

export type ShipmentWithEvents = Shipment & { events: ShipmentEventRow[] };

export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'delivered',
  'returned',
  'cancelled',
  'rejected',
  'error',
  'expired'
];

export const INACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'cancelled',
  'rejected',
  'error',
  'expired'
];

export const BLOCKING_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'requesting',
  'pending',
  'created',
  'in_transit',
  'out_for_delivery',
  'ready_for_pickup',
  'delivery_failed',
  'cancelling'
];
