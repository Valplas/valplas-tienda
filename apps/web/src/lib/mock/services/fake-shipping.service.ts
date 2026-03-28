/**
 * Fake Shipping Service - Envíos mock
 * Simula cálculo de costos de envío basado en zona postal
 */

import { ApiResponse } from '@/lib/api';
import { ShippingZone, ShippingRate, ShippingOption } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit } from '../utils/local-storage';
import { MOCK_SHIPPING_ZONES, MOCK_SHIPPING_RATES } from '../data';

const STORAGE_KEY_ZONES = 'shipping_zones';
const STORAGE_KEY_RATES = 'shipping_rates';

/**
 * Inicializa datos
 */
function initZones(): ShippingZone[] {
  return getOrInit(STORAGE_KEY_ZONES, MOCK_SHIPPING_ZONES);
}

function initRates(): ShippingRate[] {
  return getOrInit(STORAGE_KEY_RATES, MOCK_SHIPPING_RATES);
}

/**
 * Verifica si un código postal está en un rango
 * Formatos soportados: "1000-1499", "5000"
 */
function isPostcodeInRange(postcode: string, range: string): boolean {
  const pc = parseInt(postcode, 10);

  if (range.includes('-')) {
    const [min, max] = range.split('-').map((r) => parseInt(r, 10));
    return pc >= min && pc <= max;
  } else {
    return pc === parseInt(range, 10);
  }
}

/**
 * Encuentra la zona de envío para un código postal
 */
function findZoneByPostcode(postcode: string): ShippingZone | null {
  const zones = initZones();

  for (const zone of zones) {
    if (!zone.isActive) continue;

    // Verificar si está excluido
    if (zone.excludedPostcodes) {
      const isExcluded = zone.excludedPostcodes.some((range) => isPostcodeInRange(postcode, range));
      if (isExcluded) continue;
    }

    // Verificar si está incluido
    const isIncluded = zone.postcodes.some((range) => isPostcodeInRange(postcode, range));
    if (isIncluded) {
      return zone;
    }
  }

  return null;
}

/**
 * Obtener opciones de envío para un código postal y monto
 */
export async function fake_getShippingOptions(
  postcode: string,
  cartAmount: number
): Promise<ApiResponse<ShippingOption[]>> {
  return fakeFetch(() => {
    // Buscar zona
    const zone = findZoneByPostcode(postcode);

    if (!zone) {
      return {
        success: false,
        error: {
          code: 'ZONE_NOT_FOUND',
          message: 'No realizamos envíos a este código postal',
          details: { postcode }
        }
      };
    }

    // Buscar tarifas para la zona
    const rates = initRates();
    const zoneRates = rates
      .filter((r) => r.zoneId === zone.id && r.isActive)
      .sort((a, b) => b.minAmount - a.minAmount); // Ordenar de mayor a menor

    // Encontrar la tarifa aplicable según monto
    const applicableRate = zoneRates.find((r) => cartAmount >= r.minAmount);

    if (!applicableRate) {
      return {
        success: false,
        error: {
          code: 'NO_RATE_FOUND',
          message: 'No se encontró tarifa de envío para este monto'
        }
      };
    }

    // Crear opción de envío
    const option: ShippingOption = {
      carrierName: applicableRate.carrierName,
      cost: applicableRate.cost,
      estimatedDays: applicableRate.estimatedDays
    };

    return {
      success: true,
      data: [option] // En MVP solo Valplas Express, en futuro puede haber múltiples carriers
    };
  });
}

/**
 * Obtener todas las zonas de envío (admin)
 */
export async function fake_getShippingZones(): Promise<ApiResponse<ShippingZone[]>> {
  return fakeFetch(() => {
    const zones = initZones();
    return {
      success: true,
      data: zones
    };
  });
}

/**
 * Obtener todas las tarifas de envío (admin)
 */
export async function fake_getShippingRates(): Promise<ApiResponse<ShippingRate[]>> {
  return fakeFetch(() => {
    const rates = initRates();
    return {
      success: true,
      data: rates
    };
  });
}

/**
 * Obtener tarifas de una zona específica (admin)
 */
export async function fake_getZoneRates(zoneId: string): Promise<ApiResponse<ShippingRate[]>> {
  return fakeFetch(() => {
    const rates = initRates();
    const zoneRates = rates.filter((r) => r.zoneId === zoneId);

    return {
      success: true,
      data: zoneRates
    };
  });
}
