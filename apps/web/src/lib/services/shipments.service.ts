// apps/web/src/lib/services/shipments.service.ts

import { get, post, getBlob } from '../api';

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

export interface BranchSnapshot {
  id: string;
  number: string;
  code: string;
  name: string;
  address: string;
  postcode: string;
  city: string;
  province: string;
  hours: string | null;
}

export interface ShipmentPackage {
  kilos: number;
  volumeCm3: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
  declaredValue: number;
}

export interface ShipmentEvent {
  occurredAt: string;
  event: string;
  statusLabel: string | null;
  reason: string | null;
  branchName: string | null;
}

/** Envío tal como lo devuelve la API (admin: completo; cliente: subconjunto de campos). */
export interface Shipment {
  id: string;
  orderId?: string;
  carrierCode?: string;
  serviceType: ServiceType;
  contract?: string | null;
  channel?: 'B2C' | 'B2B' | null;
  status: ShipmentStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  groupNumber?: string | null;
  andreaniState?: string | null;
  destinationBranch: BranchSnapshot | null;
  localidad?: string | null;
  packages?: ShipmentPackage[];
  quotedPrice?: number | null;
  labelUrl?: string | null;
  lastEvent?: string | null;
  lastEventAt: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events: ShipmentEvent[];
}

export interface ShipmentPreview {
  serviceType: ServiceType;
  destinationBranch: BranchSnapshot | null;
  packages: ShipmentPackage[];
  totalKg: number;
  totalVolumeCm3: number;
  channel: 'B2C' | 'B2B';
  contract: string | null;
  contractError: string | null;
  localidad: { resolved: string | null; candidates: string[] };
  recipient: {
    fullName: string;
    email: string | null;
    phone: string | null;
    document: string | null;
  };
  warnings: string[];
  canCreate: boolean;
  blockReason: string | null;
}

export interface CreateShipmentBody {
  service_type: ServiceType;
  branch_id?: string;
  localidad?: string;
  packages?: {
    kilos: number;
    volume_cm3: number;
    largo_cm?: number;
    ancho_cm?: number;
    alto_cm?: number;
  }[];
}

export async function getShipmentPreview(
  orderId: string,
  opts?: { serviceType?: ServiceType; branchId?: string }
): Promise<ShipmentPreview> {
  const query = new URLSearchParams();
  if (opts?.serviceType) query.set('service_type', opts.serviceType);
  if (opts?.branchId) query.set('branch_id', opts.branchId);
  const qs = query.toString();
  const res = await get<ShipmentPreview>(
    `/shipments/orders/${orderId}/preview${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al obtener la vista previa del envío');
  }
  return res.data;
}

export async function createShipment(orderId: string, body: CreateShipmentBody): Promise<Shipment> {
  const res = await post<Shipment>(`/shipments/orders/${orderId}`, body);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al generar el envío');
  return res.data;
}

export async function cancelShipment(id: string): Promise<Shipment> {
  const res = await post<Shipment>(`/shipments/${id}/cancel`);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al cancelar el envío');
  }
  return res.data;
}

/** Descarta un envío trabado en requesting/cancelling (solo local; no llama a Andreani). */
export async function discardShipment(id: string): Promise<Shipment> {
  const res = await post<Shipment>(`/shipments/${id}/discard`);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al descartar el envío');
  }
  return res.data;
}

export interface ShipmentsConfig {
  enabled: boolean;
  mode: string;
  autoCreate: boolean;
}

export async function getShipmentsConfig(): Promise<ShipmentsConfig> {
  const res = await get<ShipmentsConfig>('/shipments/config');
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al obtener la configuración de envíos');
  }
  return res.data;
}

export async function refreshShipment(id: string): Promise<Shipment> {
  const res = await post<Shipment>(`/shipments/${id}/refresh`);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al actualizar el envío');
  }
  return res.data;
}

export function downloadShipmentLabel(id: string): Promise<Blob> {
  return getBlob(`/shipments/${id}/label`);
}

export async function getAdminPickupBranches(
  postcode: string,
  limit?: number
): Promise<BranchSnapshot[]> {
  // POST: el código postal no viaja en la URL
  const res = await post<BranchSnapshot[]>('/shipments/branches/search', {
    postcode,
    ...(limit ? { limit } : {})
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al obtener las sucursales');
  }
  return res.data;
}
