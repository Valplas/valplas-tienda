import cron, { type ScheduledTask } from 'node-cron';
import { getAndreaniConfig } from '../external/andreani/config.js';
import { isAndreaniEnabled } from '../external/andreani/index.js';
import { pollShipment } from '../../modules/shipments/shipment-lifecycle.js';
import { tryAutoCreateForOrder } from '../../modules/shipments/shipment-auto.js';
import * as shipmentRepository from '../../modules/shipments/shipment.repository.js';
import { logger } from '../logger/index.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_LEASE_SECONDS = 600;
const BACKSTOP_LIMIT = 20;
const BACKOFF_BASE_MINUTES = 15;
const BACKOFF_MAX_MINUTES = 720;

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Espera tras la falla número n+1 (n = fallas previas): min(15·2^n, 720) minutos. */
export function backoffMinutes(previousFailures: number): number {
  return Math.min(BACKOFF_BASE_MINUTES * 2 ** Math.min(previousFailures, 10), BACKOFF_MAX_MINUTES);
}

export async function pollAndreaniShipments(
  opts: { limit?: number; leaseSeconds?: number } = {}
): Promise<{ processed: number; failed: number; expired: number }> {
  const result = { processed: 0, failed: 0, expired: 0 };
  if (!isAndreaniEnabled()) return result;

  const claimed = await shipmentRepository.claimDueForPolling(
    opts.limit ?? DEFAULT_LIMIT,
    opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS
  );

  // Secuencial: una llamada a Andreani por vez, sin transacciones abiertas.
  for (const shipment of claimed) {
    try {
      await pollShipment(shipment);
      result.processed++;
      if (shipment.poll_failures > 0) {
        await shipmentRepository.updateShipment(shipment.id, { poll_failures: 0 });
      }
    } catch (error) {
      result.failed++;
      const minutes = backoffMinutes(shipment.poll_failures);
      logger.warn(
        `[andreani-tracking] Falla consultando envío ${shipment.id} (falla ${shipment.poll_failures + 1}), reintento en ${minutes} min: ${errMsg(error)}`
      );
      try {
        await shipmentRepository.updateShipment(shipment.id, {
          poll_failures: shipment.poll_failures + 1,
          next_poll_at: new Date(Date.now() + minutes * 60_000)
        });
      } catch (updateErr) {
        logger.error(
          `[andreani-tracking] No se pudo registrar el backoff del envío ${shipment.id}: ${errMsg(updateErr)}`
        );
      }
    }
  }

  const expiredIds = await shipmentRepository.expireStaleShipments();
  result.expired = expiredIds.length;

  if (getAndreaniConfig().autoCreate) {
    const orderIds = await shipmentRepository.findOrdersPendingAutoCreate(BACKSTOP_LIMIT);
    for (const orderId of orderIds) {
      try {
        await tryAutoCreateForOrder(orderId);
      } catch (error) {
        logger.error(`[andreani-tracking] Auto-create falló para ${orderId}: ${errMsg(error)}`);
      }
    }
  }

  return result;
}

let running = false;

/** Programa el polling según ANDREANI_POLL_CRON. null si Andreani está deshabilitado o el cron es inválido. */
export function scheduleAndreaniTracking(): ScheduledTask | null {
  if (!isAndreaniEnabled()) return null;
  const { pollCron } = getAndreaniConfig();
  if (!cron.validate(pollCron)) {
    logger.error(
      `[andreani-tracking] ANDREANI_POLL_CRON inválido ("${pollCron}"): job no programado`
    );
    return null;
  }

  return cron.schedule(pollCron, async () => {
    if (running) return;
    running = true;
    try {
      const r = await pollAndreaniShipments();
      if (r.processed + r.failed + r.expired > 0) {
        logger.info(
          `[andreani-tracking] procesados ${r.processed}, fallidos ${r.failed}, vencidos ${r.expired}`
        );
      }
    } catch (error) {
      logger.error(`[andreani-tracking] Error durante la corrida: ${errMsg(error)}`);
    } finally {
      running = false;
    }
  });
}
