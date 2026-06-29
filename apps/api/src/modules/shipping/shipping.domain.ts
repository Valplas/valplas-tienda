// apps/api/src/modules/shipping/shipping.domain.ts

import * as shippingRepository from './shipping.repository.js';
import type {
  ShippingZone,
  ShippingCarrier,
  ShippingRate,
  ShippingQuote,
  ShippingQuoteRequest,
  CreateShippingZoneInput,
  UpdateShippingZoneInput,
  CreateShippingCarrierInput,
  UpdateShippingCarrierInput,
  CreateShippingRateInput,
  UpdateShippingRateInput
} from './shipping.types.js';

// ============= SHIPPING ZONES =============

export async function getAllZones(params: { page: number; limit: number; is_active?: boolean }) {
  return shippingRepository.findAllZones(params);
}

export async function getZoneById(id: string): Promise<ShippingZone> {
  const zone = await shippingRepository.findZoneById(id);
  if (!zone) {
    throw new Error('Zona de envío no encontrada');
  }
  return zone;
}

export async function createZone(data: CreateShippingZoneInput): Promise<ShippingZone> {
  return shippingRepository.createZone(data);
}

export async function updateZone(id: string, data: UpdateShippingZoneInput): Promise<ShippingZone> {
  const zone = await shippingRepository.updateZone(id, data);
  if (!zone) {
    throw new Error('Zona de envío no encontrada');
  }
  return zone;
}

export async function deleteZone(id: string): Promise<void> {
  const deleted = await shippingRepository.deleteZone(id);
  if (!deleted) {
    throw new Error('Zona de envío no encontrada');
  }
}

// ============= SHIPPING CARRIERS =============

export async function getAllCarriers(params: { page: number; limit: number; is_active?: boolean }) {
  return shippingRepository.findAllCarriers(params);
}

export async function getCarrierById(id: string): Promise<ShippingCarrier> {
  const carrier = await shippingRepository.findCarrierById(id);
  if (!carrier) {
    throw new Error('Transportista no encontrado');
  }
  return carrier;
}

export async function createCarrier(data: CreateShippingCarrierInput): Promise<ShippingCarrier> {
  // Check if code already exists
  const existing = await shippingRepository.findCarrierByCode(data.code);
  if (existing) {
    throw new Error('Ya existe un transportista con ese código');
  }

  return shippingRepository.createCarrier(data);
}

export async function updateCarrier(
  id: string,
  data: UpdateShippingCarrierInput
): Promise<ShippingCarrier> {
  // If updating code, check it doesn't exist
  if (data.code) {
    const existing = await shippingRepository.findCarrierByCode(data.code);
    if (existing && existing.id !== id) {
      throw new Error('Ya existe un transportista con ese código');
    }
  }

  const carrier = await shippingRepository.updateCarrier(id, data);
  if (!carrier) {
    throw new Error('Transportista no encontrado');
  }
  return carrier;
}

export async function deleteCarrier(id: string): Promise<void> {
  const deleted = await shippingRepository.deleteCarrier(id);
  if (!deleted) {
    throw new Error('Transportista no encontrado');
  }
}

// ============= SHIPPING RATES =============

export async function getAllRates(params: {
  page: number;
  limit: number;
  zone_id?: string;
  carrier_id?: string;
  is_active?: boolean;
}) {
  return shippingRepository.findAllRates(params);
}

export async function getRateById(id: string): Promise<ShippingRate> {
  const rate = await shippingRepository.findRateById(id);
  if (!rate) {
    throw new Error('Tarifa de envío no encontrada');
  }
  return rate;
}

export async function createRate(data: CreateShippingRateInput): Promise<ShippingRate> {
  // Verify zone exists
  const zone = await shippingRepository.findZoneById(data.zone_id);
  if (!zone) {
    throw new Error('Zona de envío no encontrada');
  }

  // Verify carrier exists
  const carrier = await shippingRepository.findCarrierById(data.carrier_id);
  if (!carrier) {
    throw new Error('Transportista no encontrado');
  }

  return shippingRepository.createRate(data);
}

export async function updateRate(id: string, data: UpdateShippingRateInput): Promise<ShippingRate> {
  // Verify zone exists if provided
  if (data.zone_id) {
    const zone = await shippingRepository.findZoneById(data.zone_id);
    if (!zone) {
      throw new Error('Zona de envío no encontrada');
    }
  }

  // Verify carrier exists if provided
  if (data.carrier_id) {
    const carrier = await shippingRepository.findCarrierById(data.carrier_id);
    if (!carrier) {
      throw new Error('Transportista no encontrado');
    }
  }

  const rate = await shippingRepository.updateRate(id, data);
  if (!rate) {
    throw new Error('Tarifa de envío no encontrada');
  }
  return rate;
}

export async function deleteRate(id: string): Promise<void> {
  const deleted = await shippingRepository.deleteRate(id);
  if (!deleted) {
    throw new Error('Tarifa de envío no encontrada');
  }
}

// ============= SHIPPING QUOTES =============

export async function getShippingQuote(request: ShippingQuoteRequest): Promise<ShippingQuote[]> {
  const { postcode, cart_total } = request;

  // Todas las zonas activas que sirven este CP (no depender de "la primera")
  const zones = await shippingRepository.findZonesByPostcode(postcode);
  if (zones.length === 0) {
    throw new Error('No hay envíos disponibles para este código postal');
  }
  const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));

  // Tarifas de todas esas zonas que aplican al monto
  const rates = await shippingRepository.findRatesByZonesAndAmount(
    zones.map((z) => z.id),
    cart_total
  );
  if (rates.length === 0) {
    throw new Error('No hay opciones de envío disponibles para este monto');
  }

  // Get carrier details for each rate
  const quotes: ShippingQuote[] = [];
  for (const rate of rates) {
    const carrier = await shippingRepository.findCarrierById(rate.carrier_id);
    if (!carrier || !carrier.is_active) continue;

    // max_amount = umbral de envío gratis: si el carrito lo alcanza, precio 0
    const isFreeShipping = rate.max_amount != null && cart_total >= rate.max_amount;
    const price = isFreeShipping ? 0 : rate.price;

    quotes.push({
      carrier_id: carrier.id,
      carrier_name: carrier.name,
      carrier_logo: carrier.logo_url,
      price,
      estimated_days: `${rate.estimated_days_min}-${rate.estimated_days_max} días`,
      zone_name: zoneNameById.get(rate.zone_id) ?? ''
    });
  }

  if (quotes.length === 0) {
    throw new Error('No hay transportistas activos disponibles');
  }

  // Sort by price (cheapest first)
  return quotes.sort((a, b) => a.price - b.price);
}
