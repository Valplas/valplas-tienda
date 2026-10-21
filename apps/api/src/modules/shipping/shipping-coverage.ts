// apps/api/src/modules/shipping/shipping-coverage.ts

import { AppError } from '../../shared/middleware/error.middleware.js';
import * as shippingRepository from './shipping.repository.js';

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
