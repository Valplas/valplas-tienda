// apps/api/src/modules/shipping/shipping-coverage.ts

import { AppError } from '../../shared/middleware/error.middleware.js';
import * as shippingRepository from './shipping.repository.js';
import type { ShippingZone } from './shipping.types.js';

/** Regla de cobertura: una zona activa sirve un CP salvo que lo excluya explícitamente. */
export function zoneCoversPostcode(zone: ShippingZone, postcode: string): boolean {
  return !(zone.excluded_postcodes && zone.excluded_postcodes.includes(postcode));
}

/**
 * Todas las zonas activas que sirven este código postal. Se usa para cotizar/crear pedido sin
 * depender de "la primera zona": si hay varias, se juntan las tarifas de todas las que sirven el CP.
 */
export async function findZonesCoveringPostcode(postcode: string): Promise<ShippingZone[]> {
  const zones = await shippingRepository.findActiveZones();
  return zones.filter((zone) => zoneCoversPostcode(zone, postcode));
}

/**
 * Marca cada dirección con `is_deliverable` (alguna zona activa cubre su CP). Las direcciones se
 * guardan aunque no haya cobertura: el aviso lo muestra el front. Una sola query de zonas para
 * toda la lista.
 */
export async function withDeliverability<T extends { postcode: string }>(
  addresses: T[]
): Promise<Array<T & { is_deliverable: boolean }>> {
  if (addresses.length === 0) return [];
  const zones = await shippingRepository.findActiveZones();
  return addresses.map((address) => ({
    ...address,
    is_deliverable: zones.some((zone) => zoneCoversPostcode(zone, address.postcode))
  }));
}

/**
 * Error para un código postal sin zona de envío que lo cubra. Distingue "no
 * hay zonas activas" (el admin todavía no configuró envíos: el front lo guía a
 * configurarlas) de "las zonas activas excluyen este CP".
 */
export async function noCoverageError(postcode: string): Promise<AppError> {
  const activeZones = await shippingRepository.countActiveZones();
  if (activeZones === 0) {
    return new AppError(
      'NO_SHIPPING_ZONES',
      'Por el momento no realizamos envíos a domicilio: no hay zonas de envío activas.',
      400
    );
  }
  return new AppError(
    'POSTCODE_NOT_COVERED',
    `No realizamos envíos al código postal ${postcode}`,
    400
  );
}
