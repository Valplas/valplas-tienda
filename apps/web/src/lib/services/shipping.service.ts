// apps/web/src/lib/services/shipping.service.ts

import { get } from '../api';
import type { ApiResponse } from '../api';

export interface ShippingZone {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingRate {
  id: string;
  zoneId: string;
  carrierId: string;
  minAmount: number;
  maxAmount: number | null;
  baseCost: number;
  freeShippingThreshold: number | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
}

export interface ShippingQuoteRequest {
  postalCode: string;
  cartTotal: number;
}

// El backend devuelve un array plano de cotizaciones (una por tarifa/carrier).
export interface ShippingQuote {
  carrierId: string;
  carrierName: string;
  carrierLogo: string | null;
  price: number;
  estimatedDays: string;
  zoneName: string;
}

/**
 * Obtener todas las zonas de envío activas
 */
export async function getShippingZones(): Promise<ApiResponse<ShippingZone[]>> {
  return get<ShippingZone[]>('/shipping/zones');
}

/**
 * Cotizar envío por código postal y monto
 */
export async function quoteShipping(
  request: ShippingQuoteRequest
): Promise<ApiResponse<ShippingQuote[]>> {
  const params = new URLSearchParams({
    postcode: request.postalCode,
    cart_total: String(request.cartTotal)
  });
  return get<ShippingQuote[]>(`/shipping/quote?${params.toString()}`);
}
