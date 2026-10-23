// apps/api/src/modules/shipping/shipping-cost.ts

import { AppError } from '../../shared/middleware/error.middleware.js';
import * as shippingRepository from './shipping.repository.js';
import { findZonesCoveringPostcode, noCoverageError } from './shipping-coverage.js';
import type { ShippingRate } from './shipping.types.js';

/** Precio de una tarifa para un monto: max_amount = umbral de envío gratis. */
export function rateShippingPrice(rate: ShippingRate, amount: number): number {
  const isFreeShipping = rate.max_amount != null && amount >= rate.max_amount;
  return isFreeShipping ? 0 : rate.price;
}

/**
 * Costo de envío de un carrier para un código postal y monto (mismas zonas/tarifas que la
 * cotización pública). Lanza NO_SHIPPING_ZONES / POSTCODE_NOT_COVERED si no hay cobertura y
 * SHIPPING_RATE_NOT_FOUND si el carrier no tiene tarifa para esas zonas.
 */
export async function getCarrierShippingCost(
  postcode: string,
  carrierId: string,
  amount: number
): Promise<number> {
  const zones = await findZonesCoveringPostcode(postcode);
  if (zones.length === 0) {
    throw await noCoverageError(postcode);
  }

  const rates = await shippingRepository.findRatesByZonesAndAmount(
    zones.map((z) => z.id),
    amount
  );
  const selectedRate = rates.find((r) => r.carrier_id === carrierId);

  if (!selectedRate) {
    throw new AppError(
      'SHIPPING_RATE_NOT_FOUND',
      'Tarifa de envío no encontrada para este transportista',
      400
    );
  }

  return rateShippingPrice(selectedRate, amount);
}
