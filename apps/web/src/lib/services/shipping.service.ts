// apps/web/src/lib/services/shipping.service.ts

import { get, post } from '../api';
import type { ApiResponse } from '../api';

export interface ShippingZone {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingRate {
  id: string;
  zone_id: string;
  carrier_id: string;
  min_amount: number;
  max_amount: number | null;
  base_cost: number;
  free_shipping_threshold: number | null;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active: boolean;
}

export interface ShippingQuoteRequest {
  postalCode: string;
  cartTotal: number;
}

export interface ShippingQuote {
  zone: ShippingZone;
  rates: Array<{
    carrier: {
      id: string;
      name: string;
      code: string;
    };
    cost: number;
    estimatedDays: string;
    isFreeShipping: boolean;
  }>;
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
): Promise<ApiResponse<ShippingQuote>> {
  return post<ShippingQuote>('/shipping/quote', request);
}
