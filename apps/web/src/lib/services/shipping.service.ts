// apps/web/src/lib/services/shipping.service.ts

import { get, post } from '../api';
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
  return post<ShippingQuote>('/shipping/quote', {
    postcode: request.postalCode,
    cart_total: request.cartTotal
  });
}
