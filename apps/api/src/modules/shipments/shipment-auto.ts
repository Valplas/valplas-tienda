import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import { logger } from '../../infrastructure/logger/index.js';
import { findOrderById } from '../orders/order.repository.js';
import { createForOrder } from './shipment.domain.js';
import * as shipmentRepository from './shipment.repository.js';

/**
 * Crea el envío de Andreani de un pedido recién pagado (flag ANDREANI_AUTO_CREATE_SHIPMENT).
 * Nunca lanza por fallas de negocio: un intento fallido deja una fila 'error' (created_by null),
 * que además evita que el respaldo del job lo reintente en bucle.
 */
export async function tryAutoCreateForOrder(
  orderId: string
): Promise<'created' | 'skipped' | 'failed'> {
  if (!getAndreaniConfig().autoCreate) return 'skipped';

  const order = await findOrderById(orderId);
  if (!order || order.status !== 'processing' || !order.shipping_carrier_id) return 'skipped';

  const code = await shipmentRepository.findCarrierCode(order.shipping_carrier_id);
  if (code !== 'andreani') return 'skipped';

  if ((await shipmentRepository.countByOrderId(orderId)) > 0) return 'skipped';

  try {
    await createForOrder(
      orderId,
      { serviceType: order.shipping_method, branchId: order.pickup_branch?.id },
      null
    );
    return 'created';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[andreani-auto] No se pudo crear el envío del pedido ${orderId}: ${message}`);
    try {
      await shipmentRepository.insertError({
        orderId,
        serviceType: order.shipping_method,
        message,
        createdBy: null
      });
    } catch (insertErr) {
      logger.error(
        `[andreani-auto] No se pudo registrar el error del pedido ${orderId}: ${insertErr instanceof Error ? insertErr.message : String(insertErr)}`
      );
    }
    return 'failed';
  }
}
