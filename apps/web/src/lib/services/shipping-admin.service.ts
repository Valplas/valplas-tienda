// apps/web/src/lib/services/shipping-admin.service.ts
//
// Servicio admin de envíos contra el backend REAL (no mock).
// Respuestas en camelCase (middleware del backend); bodies en snake_case (lo que esperan
// los controllers). Listados: { data: T[], pagination } (ApiResponse.paginated).

import { get, post, patch, del } from '../api';

// ─── Tipos (respuestas camelCase) ─────────────────────────────────────────────

export interface AdminZone {
  id: string;
  name: string;
  provinces: string[];
  excludedPostcodes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCarrier {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRate {
  id: string;
  zoneId: string;
  carrierId: string;
  minAmount: number;
  maxAmount: number | null;
  price: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListParams {
  page?: number;
  limit?: number;
  isActive?: boolean;
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  if (!params) return '';
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    // is_active espera 'true'/'false' como string en el backend
    query.set(key === 'isActive' ? 'is_active' : key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

// ─── Zonas ────────────────────────────────────────────────────────────────────

export async function getShippingZonesAdmin(params?: ListParams) {
  const res = await get<AdminZone[]>(`/shipping/zones${buildQuery({ ...params })}`);
  if (!res.success || !res.data) return { zones: [] as AdminZone[], total: 0 };
  return { zones: res.data, total: res.pagination?.total ?? res.data.length };
}

export interface ShippingZoneBody {
  name: string;
  provinces: string[];
  excluded_postcodes?: string[];
  is_active?: boolean;
}

export async function createShippingZone(data: ShippingZoneBody) {
  const res = await post<AdminZone>('/shipping/zones', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear zona');
  return res.data;
}

export async function updateShippingZone(id: string, data: Partial<ShippingZoneBody>) {
  const res = await patch<AdminZone>(`/shipping/zones/${id}`, data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al actualizar zona');
  return res.data;
}

export async function deleteShippingZone(id: string) {
  const res = await del(`/shipping/zones/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar zona');
}

// ─── Carriers ───────────────────────────────────────────────────────────────

export async function getCarriersAdmin(params?: ListParams) {
  const res = await get<AdminCarrier[]>(`/shipping/admin/carriers${buildQuery({ ...params })}`);
  if (!res.success || !res.data) return { carriers: [] as AdminCarrier[], total: 0 };
  return { carriers: res.data, total: res.pagination?.total ?? res.data.length };
}

export interface CarrierBody {
  name: string;
  code: string;
  logo_url?: string;
  is_active?: boolean;
}

export async function createCarrier(data: CarrierBody) {
  const res = await post<AdminCarrier>('/shipping/admin/carriers', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear carrier');
  return res.data;
}

export async function updateCarrier(id: string, data: Partial<CarrierBody>) {
  const res = await patch<AdminCarrier>(`/shipping/admin/carriers/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar carrier');
  return res.data;
}

export async function deleteCarrier(id: string) {
  const res = await del(`/shipping/admin/carriers/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar carrier');
}

// ─── Tarifas ──────────────────────────────────────────────────────────────────

export async function getRatesAdmin(params?: ListParams & { zoneId?: string; carrierId?: string }) {
  const query = buildQuery({
    page: params?.page,
    limit: params?.limit,
    isActive: params?.isActive,
    zone_id: params?.zoneId,
    carrier_id: params?.carrierId
  });
  const res = await get<AdminRate[]>(`/shipping/rates${query}`);
  if (!res.success || !res.data) return { rates: [] as AdminRate[], total: 0 };
  return { rates: res.data, total: res.pagination?.total ?? res.data.length };
}

export interface RateBody {
  zone_id: string;
  carrier_id: string;
  min_amount: number;
  max_amount?: number;
  price: number;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active?: boolean;
}

export async function createRate(data: RateBody) {
  const res = await post<AdminRate>('/shipping/rates', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear tarifa');
  return res.data;
}

export async function updateRate(id: string, data: Partial<RateBody>) {
  const res = await patch<AdminRate>(`/shipping/rates/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar tarifa');
  return res.data;
}

export async function deleteRate(id: string) {
  const res = await del(`/shipping/rates/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar tarifa');
}
