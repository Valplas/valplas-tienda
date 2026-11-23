// apps/api/src/modules/shipments/shipment.view.ts
//
// Proyecciones de un envío para la API de pedidos: el admin ve todo salvo los payloads crudos
// del correo; el cliente solo ve lo necesario para seguir su paquete.

import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import type { BranchSnapshot } from '../../infrastructure/external/andreani/branches.js';
import type { ServiceType, ShipmentStatus, ShipmentWithEvents } from './shipment.types.js';

/** Estados que el cliente no debe ver (fallidos, cancelados o aún sin confirmar con el correo). */
export const CUSTOMER_HIDDEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'error',
  'rejected',
  'cancelled',
  'expired',
  'requesting'
];

type DateLike = Date | string | null;

export interface CustomerShipmentView {
  id: string;
  service_type: ServiceType;
  status: ShipmentStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  destination_branch: BranchSnapshot | null;
  estimated_delivery_at: DateLike;
  delivered_at: DateLike;
  last_event_at: DateLike;
  events: {
    occurred_at: Date | string;
    event: string;
    status_label: string | null;
    reason: string | null;
    branch_name: string | null;
  }[];
}

export type AdminShipmentView = Omit<ShipmentWithEvents, 'request_payload' | 'raw_response'> & {
  tracking_url: string | null;
};

export function trackingUrlFor(trackingNumber: string | null): string | null {
  if (!trackingNumber) return null;
  const template = getAndreaniConfig().trackingUrlTemplate;
  if (!template) return null;
  return template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

export function toCustomerShipment(s: ShipmentWithEvents): CustomerShipmentView {
  return {
    id: s.id,
    service_type: s.service_type,
    status: s.status,
    tracking_number: s.tracking_number,
    tracking_url: trackingUrlFor(s.tracking_number),
    destination_branch: s.destination_branch,
    estimated_delivery_at: s.estimated_delivery_at,
    delivered_at: s.delivered_at,
    last_event_at: s.last_event_at,
    events: s.events.map((e) => ({
      occurred_at: e.occurred_at,
      event: e.event,
      status_label: e.status_label,
      reason: e.reason,
      branch_name: e.branch_name
    }))
  };
}

export function toAdminShipment(s: ShipmentWithEvents): AdminShipmentView {
  const { request_payload, raw_response, ...rest } = s;
  void request_payload;
  void raw_response;
  return { ...rest, tracking_url: trackingUrlFor(s.tracking_number) };
}

export function customerVisibleShipments(shipments: ShipmentWithEvents[]): CustomerShipmentView[] {
  return shipments
    .filter((s) => !CUSTOMER_HIDDEN_SHIPMENT_STATUSES.includes(s.status))
    .map(toCustomerShipment);
}
