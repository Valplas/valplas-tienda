/**
 * Mock Shipping Admin Service
 * Handles shipping zones and carriers management for admin
 */

import { ApiResponse } from '@/lib/api';
import { ShippingZone } from '@/types';
import { MOCK_SHIPPING_ZONES, MOCK_SHIPPING_RATES } from '../data';
import { ShippingZoneFormData, CarrierFormData } from '@/lib/validations/shipping';

const STORAGE_KEY_ZONES = 'valplas_mock_shipping_zones';
const STORAGE_KEY_CARRIERS = 'valplas_mock_carriers';

// ============================================================================
// HELPERS
// ============================================================================

function getZonesFromStorage(): ShippingZone[] {
  if (typeof window === 'undefined') return MOCK_SHIPPING_ZONES;
  const stored = localStorage.getItem(STORAGE_KEY_ZONES);
  return stored ? JSON.parse(stored) : MOCK_SHIPPING_ZONES;
}

function saveZonesToStorage(zones: ShippingZone[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
}

interface Carrier {
  id: string;
  name: string;
  baseRate: number;
  estimatedDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function getCarriersFromStorage(): Carrier[] {
  if (typeof window === 'undefined') {
    // Extract unique carriers from shipping rates
    const uniqueCarriers = new Map<string, Carrier>();
    MOCK_SHIPPING_RATES.forEach((rate) => {
      if (!uniqueCarriers.has(rate.carrierName)) {
        uniqueCarriers.set(rate.carrierName, {
          id: `carrier-${uniqueCarriers.size + 1}`,
          name: rate.carrierName,
          baseRate: rate.cost,
          estimatedDays: rate.estimatedDays,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });
    return Array.from(uniqueCarriers.values());
  }
  const stored = localStorage.getItem(STORAGE_KEY_CARRIERS);
  if (stored) return JSON.parse(stored);

  // First time: extract from mock data
  const uniqueCarriers = new Map<string, Carrier>();
  MOCK_SHIPPING_RATES.forEach((rate) => {
    if (!uniqueCarriers.has(rate.carrierName)) {
      uniqueCarriers.set(rate.carrierName, {
        id: `carrier-${uniqueCarriers.size + 1}`,
        name: rate.carrierName,
        baseRate: rate.cost,
        estimatedDays: rate.estimatedDays,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  });
  const carriers = Array.from(uniqueCarriers.values());
  saveCarriersToStorage(carriers);
  return carriers;
}

function saveCarriersToStorage(carriers: Carrier[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CARRIERS, JSON.stringify(carriers));
}

// ============================================================================
// SHIPPING ZONES
// ============================================================================

export async function fake_getShippingZones(): Promise<ApiResponse<ShippingZone[]>> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const zones = getZonesFromStorage();
    return {
      success: true,
      data: zones
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Error al cargar zonas de envío'
      }
    };
  }
}

export async function fake_createShippingZone(
  data: ShippingZoneFormData
): Promise<ApiResponse<ShippingZone>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const zones = getZonesFromStorage();

    // Parse postcodes
    const postcodes = data.postcodes.split(',').map((c) => c.trim());

    const newZone: ShippingZone = {
      id: `zone-${Date.now()}`,
      name: data.name,
      province: 'Buenos Aires', // Default for MVP
      postcodes,
      isActive: data.isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    zones.push(newZone);
    saveZonesToStorage(zones);

    return {
      success: true,
      data: newZone
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Error al crear zona de envío'
      }
    };
  }
}

export async function fake_updateShippingZone(
  id: string,
  data: ShippingZoneFormData
): Promise<ApiResponse<ShippingZone>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const zones = getZonesFromStorage();
    const index = zones.findIndex((z) => z.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Zona no encontrada'
        }
      };
    }

    // Parse postcodes
    const postcodes = data.postcodes.split(',').map((c) => c.trim());

    zones[index] = {
      ...zones[index],
      name: data.name,
      postcodes,
      isActive: data.isActive,
      updatedAt: new Date().toISOString()
    };

    saveZonesToStorage(zones);

    return {
      success: true,
      data: zones[index]
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Error al actualizar zona de envío'
      }
    };
  }
}

export async function fake_deleteShippingZone(id: string): Promise<ApiResponse<void>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const zones = getZonesFromStorage();
    const filtered = zones.filter((z) => z.id !== id);
    saveZonesToStorage(filtered);

    return {
      success: true,
      data: undefined
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Error al eliminar zona de envío'
      }
    };
  }
}

// ============================================================================
// CARRIERS
// ============================================================================

export async function fake_getCarriers(): Promise<ApiResponse<Carrier[]>> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const carriers = getCarriersFromStorage();
    return {
      success: true,
      data: carriers
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Error al cargar carriers'
      }
    };
  }
}

export async function fake_createCarrier(data: CarrierFormData): Promise<ApiResponse<Carrier>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const carriers = getCarriersFromStorage();

    const newCarrier: Carrier = {
      id: `carrier-${Date.now()}`,
      name: data.name,
      baseRate: data.baseRate,
      estimatedDays: data.estimatedDays,
      isActive: data.isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    carriers.push(newCarrier);
    saveCarriersToStorage(carriers);

    return {
      success: true,
      data: newCarrier
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Error al crear carrier'
      }
    };
  }
}

export async function fake_updateCarrier(
  id: string,
  data: CarrierFormData
): Promise<ApiResponse<Carrier>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const carriers = getCarriersFromStorage();
    const index = carriers.findIndex((c) => c.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Carrier no encontrado'
        }
      };
    }

    carriers[index] = {
      ...carriers[index],
      name: data.name,
      baseRate: data.baseRate,
      estimatedDays: data.estimatedDays,
      isActive: data.isActive,
      updatedAt: new Date().toISOString()
    };

    saveCarriersToStorage(carriers);

    return {
      success: true,
      data: carriers[index]
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Error al actualizar carrier'
      }
    };
  }
}

export async function fake_deleteCarrier(id: string): Promise<ApiResponse<void>> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const carriers = getCarriersFromStorage();
    const filtered = carriers.filter((c) => c.id !== id);
    saveCarriersToStorage(filtered);

    return {
      success: true,
      data: undefined
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Error al eliminar carrier'
      }
    };
  }
}

export type { Carrier };
