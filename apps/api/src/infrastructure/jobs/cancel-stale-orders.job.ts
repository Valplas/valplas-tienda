import cron from 'node-cron';
import * as orderRepository from '../../modules/orders/order.repository.js';
import { PAYMENT_EXPIRATION_HOURS } from '../external/mercadopago.js';
import { logger } from '../logger/index.js';

/**
 * Buffer de 1h sobre la expiración de la preferencia de MP: evita cancelar
 * una orden cuyo pago se aprobó al filo y cuyo webhook todavía no llegó.
 */
const STALE_AFTER_HOURS = PAYMENT_EXPIRATION_HOURS + 1;

/**
 * Cancela órdenes pending_payment de MercadoPago cuya preferencia ya expiró.
 * La transición a `cancelled` dispara el trigger de DB que libera el stock
 * reservado. Devuelve la cantidad de órdenes canceladas.
 */
export async function cancelStaleOrders(): Promise<number> {
  const staleOrders = await orderRepository.findStalePendingPaymentOrders(STALE_AFTER_HOURS);

  let cancelled = 0;
  // Secuencial a propósito: volumen bajo y evita ráfagas de conexiones a la DB.
  for (const order of staleOrders) {
    try {
      await orderRepository.updateOrderStatus(
        order.id,
        {
          status: 'cancelled',
          notes: 'Cancelación automática: pago no completado (preferencia de MP expirada)'
        },
        order.user_id
      );
      cancelled++;
    } catch (error) {
      logger.error(
        `[cancel-stale-orders] Error cancelando ${order.order_number}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (staleOrders.length > 0) {
    logger.info(`[cancel-stale-orders] ${cancelled}/${staleOrders.length} órdenes canceladas`);
  }

  return cancelled;
}

/**
 * Corre cada hora (minuto 15). Cancela órdenes pending_payment con más de
 * PAYMENT_EXPIRATION_HOURS + 1 horas de antigüedad.
 */
export function scheduleStaleOrderCancellation(): void {
  cron.schedule('15 * * * *', async () => {
    try {
      await cancelStaleOrders();
    } catch (error) {
      logger.error(
        `[cancel-stale-orders] Error durante la corrida: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
}
