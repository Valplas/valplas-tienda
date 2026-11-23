import { transaction } from '../../infrastructure/database/client.js';
import { advanceOrderTo, revertOrderToProcessing } from '../orders/order.repository.js';
import { deriveShipmentStatus, orderTargetFor, type ShipmentEventInput } from './event-mapping.js';
import * as shipmentRepository from './shipment.repository.js';
import { INACTIVE_SHIPMENT_STATUSES, type ShipmentStatus } from './shipment.types.js';

/**
 * Un envío en 'cancelling' (cancelación pedida) solo sale de ahí si Andreani confirma que se
 * anuló o que el paquete ya avanzó; un evento temprano (ej. OrdenDeEnvioCreada) no lo pisa.
 */
const LEAVES_CANCELLING: ReadonlySet<ShipmentStatus> = new Set([
  'cancelled',
  'in_transit',
  'out_for_delivery',
  'ready_for_pickup',
  'delivery_failed',
  'delivered',
  'returning',
  'returned',
  'incident'
]);

/** Minutos hasta el próximo polling; `null` si el estado es terminal (no se vuelve a consultar). */
const POLL_DELAY_MINUTES: Partial<Record<ShipmentStatus, number>> = {
  requesting: 5,
  pending: 30,
  created: 30,
  cancelling: 15,
  in_transit: 60,
  out_for_delivery: 60,
  delivery_failed: 60,
  returning: 60,
  incident: 60,
  ready_for_pickup: 360
};

export function nextPollDelayMinutes(status: ShipmentStatus): number | null {
  return POLL_DELAY_MINUTES[status] ?? null;
}

/**
 * Guarda los eventos ya obtenidos de Andreani (pull, push o mock), deriva el estado del envío
 * desde todo el historial y adelanta el pedido. Una sola transacción, sin llamadas HTTP.
 * Orden de locks: envío primero, pedido después (advanceOrderTo).
 */
export async function ingestEvents(
  shipmentId: string,
  events: ShipmentEventInput[],
  source: 'pull' | 'push' | 'mock'
): Promise<{ inserted: number; status: ShipmentStatus }> {
  return transaction(async (client) => {
    const shipment = await shipmentRepository.findById(shipmentId, client, true);
    if (!shipment) throw new Error(`Envío ${shipmentId} no encontrado`);

    const inserted = await shipmentRepository.insertEventsTx(client, shipmentId, events, source);
    if (inserted.length === 0) {
      // Sin eventos nuevos igual se reprograma: el claim dejó solo un lease corto en next_poll_at.
      const idleDelay = nextPollDelayMinutes(shipment.status);
      await shipmentRepository.updateShipment(
        shipmentId,
        { next_poll_at: idleDelay === null ? null : new Date(Date.now() + idleDelay * 60_000) },
        client
      );
      return { inserted: 0, status: shipment.status };
    }

    const all = await shipmentRepository.findEvents(shipmentId, client);
    const last = all[all.length - 1];
    const sticky = INACTIVE_SHIPMENT_STATUSES.includes(shipment.status);
    const derived = sticky
      ? shipment.status
      : deriveShipmentStatus(
          all.map((e) => ({
            event: e.event,
            cycle: e.cycle,
            reason: e.reason,
            occurredAt: e.occurred_at
          })),
          shipment.service_type,
          shipment.status
        );
    const status =
      shipment.status === 'cancelling' && !LEAVES_CANCELLING.has(derived)
        ? shipment.status
        : derived;

    const delay = nextPollDelayMinutes(status);
    const patch: Parameters<typeof shipmentRepository.updateShipment>[1] = {
      status,
      last_event: last.event,
      last_event_at: last.occurred_at,
      andreani_state: last.status_label,
      next_poll_at: delay === null ? null : new Date(Date.now() + delay * 60_000)
    };
    if (status === 'delivered' && !shipment.delivered_at) patch.delivered_at = last.occurred_at;
    if (status === 'cancelled' && !shipment.cancelled_at) patch.cancelled_at = new Date();
    await shipmentRepository.updateShipment(shipmentId, patch, client);

    // Un envío devuelto salió del depósito: si el lote llegó entero (sin eventos intermedios
    // previos) el pedido igual debe figurar como enviado, nunca entregado.
    const target = sticky
      ? null
      : (orderTargetFor(status) ?? (status === 'returned' ? 'shipped' : null));
    if (target) {
      await advanceOrderTo(client, shipment.order_id, target, `Andreani: ${last.event}`, {
        trackingNumber: shipment.tracking_number ?? undefined
      });
    }
    // Anulado o rechazado por el correo: el pedido vuelve a 'processing' para poder regenerar.
    if (!sticky && (status === 'cancelled' || status === 'rejected')) {
      await revertOrderToProcessing(
        client,
        shipment.order_id,
        `Andreani: ${last.event}`,
        shipment.tracking_number
      );
    }
    return { inserted: inserted.length, status };
  });
}
