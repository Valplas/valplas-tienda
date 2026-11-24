// Ciclo de vida de un envío ya creado: resultado del alta, polling por estado, cancelación en
// curso y refresh manual. Ninguna transacción se mantiene abierta durante una llamada HTTP.

import type { PoolClient } from 'pg';
import { transaction } from '../../infrastructure/database/client.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  getAndreaniClient,
  isAndreaniEnabled
} from '../../infrastructure/external/andreani/index.js';
import { AndreaniError, isRetryable } from '../../infrastructure/external/andreani/errors.js';
import type {
  AndreaniCreateOrderRequest,
  AndreaniCreateOrderResult,
  AndreaniOrderResponse,
  AndreaniTraceEvent
} from '../../infrastructure/external/andreani/types.js';
import {
  advanceOrderTo,
  findOrderById,
  revertOrderToProcessing
} from '../orders/order.repository.js';
import { deriveShipmentStatus, parseAndreaniDate, traceToEventInput } from './event-mapping.js';
import * as shipmentRepository from './shipment.repository.js';
import { ingestEvents, nextPollDelayMinutes } from './shipment-ingest.js';
import type { Shipment, ShipmentStatus } from './shipment.types.js';

/** Un alta que sigue sin confirmarse tras este tiempo o estas fallas se da por perdida. */
const REQUESTING_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const REQUESTING_GIVE_UP_FAILURES = 12;
export const REQUESTING_GIVE_UP_MESSAGE =
  'Andreani no confirmó el alta tras varios intentos; verificá en el portal de Andreani antes de reintentar';
const CREATABLE_ORDER_STATUSES = ['payment_confirmed', 'processing', 'ready_to_ship'];

const minutesFromNow = (m: number): Date => new Date(Date.now() + m * 60_000);

export function andreaniDisabledError(): AppError {
  return new AppError('ANDREANI_DISABLED', 'La integración con Andreani está deshabilitada', 503);
}

export function andreaniUnavailableError(e: AndreaniError): AppError {
  return new AppError(
    'ANDREANI_UNAVAILABLE',
    'No se pudo comunicar con Andreani, probá de nuevo en unos minutos',
    502,
    { code: e.code }
  );
}

/** Estado que empieza con "Cread" -> created, "Rechaz" -> rejected, cualquier otro -> pending. */
export function classifyEstado(
  estado: string | null | undefined
): 'created' | 'rejected' | 'pending' {
  const s = (estado ?? '').trim().toLowerCase();
  if (s.startsWith('cread')) return 'created';
  if (s.startsWith('rechaz')) return 'rejected';
  return 'pending';
}

function parseEstimated(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  try {
    return parseAndreaniDate(s.includes('T') ? s : `${s}T00:00:00`);
  } catch {
    return undefined;
  }
}

/** Aplica la respuesta de Andreani al envío (requesting|pending) y mueve el pedido. */
async function applyOrderResponse(
  client: PoolClient,
  s: Shipment,
  body: AndreaniOrderResponse
): Promise<Shipment> {
  const kind = classifyEstado(body.estado);
  const tracking = body.bultos?.[0]?.numeroDeEnvio ?? s.tracking_number;
  const patch: Partial<Shipment> = {
    status: kind,
    tracking_number: tracking,
    group_number: body.agrupadorDeBultos ?? s.group_number,
    label_url: body.etiquetasPorAgrupador ?? s.label_url,
    andreani_state: body.estado,
    raw_response: body,
    estimated_delivery_at: parseEstimated(body.fechaEstimadaDeEntrega),
    error_message: null,
    poll_failures: 0
  };

  if (kind === 'rejected') {
    patch.next_poll_at = null;
    patch.error_message = `Andreani rechazó el pre-envío (estado: ${body.estado})`;
    const updated = await shipmentRepository.updateShipment(s.id, patch, client);
    await revertOrderToProcessing(client, s.order_id, 'Pre-envío Andreani rechazado', tracking);
    return updated;
  }

  const delay = nextPollDelayMinutes(kind);
  patch.next_poll_at = delay === null ? null : minutesFromNow(delay);
  const updated = await shipmentRepository.updateShipment(s.id, patch, client);
  await advanceOrderTo(
    client,
    s.order_id,
    'ready_to_ship',
    `Envío Andreani generado (${tracking ?? 's/n'})`,
    { trackingNumber: tracking ?? undefined }
  );
  return updated;
}

/** tx2 del alta (también la usa el job al reenviar un 'requesting'). Idempotente. */
export async function applyCreateResult(
  shipmentId: string,
  result: AndreaniCreateOrderResult
): Promise<Shipment> {
  return transaction(async (client) => {
    const s = await shipmentRepository.findById(shipmentId, client, true);
    if (!s) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
    if (s.status !== 'requesting' && s.status !== 'pending') return s;
    return applyOrderResponse(client, s, result.body);
  });
}

/** Pasa un 'requesting' a 'error' (idempotente: si ya no está en requesting no hace nada). */
async function markRequestingError(shipmentId: string, message: string): Promise<Shipment> {
  return transaction(async (client) => {
    const fresh = await shipmentRepository.findById(shipmentId, client, true);
    if (!fresh) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
    if (fresh.status !== 'requesting') return fresh;
    return shipmentRepository.updateShipment(
      shipmentId,
      { status: 'error', error_message: message, next_poll_at: null },
      client
    );
  });
}

/** Falla del POST: error definitivo (fila 'error' + 422) o transitorio (queda 'requesting'). */
export async function handleCreateFailure(
  shipment: Shipment,
  e: unknown
): Promise<{ shipment: Shipment; error: AppError | null }> {
  if (!(e instanceof AndreaniError)) throw e;
  if (isRetryable(e)) {
    // Una creación real habría respondido 208 al reenviar: si tras 24 h / 12 intentos sigue sin
    // confirmarse, el envío no existe en Andreani y se libera el pedido (estado 'error').
    const age = Date.now() - new Date(shipment.created_at).getTime();
    if (
      shipment.status === 'requesting' &&
      (age > REQUESTING_GIVE_UP_MS || shipment.poll_failures + 1 >= REQUESTING_GIVE_UP_FAILURES)
    ) {
      const failed = await markRequestingError(shipment.id, REQUESTING_GIVE_UP_MESSAGE);
      return { shipment: failed, error: null };
    }
    const updated = await shipmentRepository.updateShipment(shipment.id, {
      next_poll_at: minutesFromNow(5),
      poll_failures: shipment.poll_failures + 1
    });
    return { shipment: updated, error: null };
  }
  const detail =
    e.fieldErrors.length > 0 ? e.fieldErrors.map((f) => f.message).join('; ') : e.message;
  const updated = await shipmentRepository.updateShipment(shipment.id, {
    status: 'error',
    error_message: detail,
    next_poll_at: null
  });
  return {
    shipment: updated,
    error: new AppError(
      'ANDREANI_VALIDATION',
      `Andreani rechazó el envío: ${detail}`,
      422,
      e.fieldErrors
    )
  };
}

async function pollRequesting(s: Shipment): Promise<Shipment> {
  if (!s.request_payload) return s;
  // Si el pedido ya no está activo (cancelado, reembolsado...) no se reenvía el alta.
  const order = await findOrderById(s.order_id);
  if (!order || !CREATABLE_ORDER_STATUSES.includes(order.status)) {
    return markRequestingError(
      s.id,
      `El pedido ya no admite envío (estado: ${order?.status ?? 'inexistente'}); no se reenvió el alta a Andreani`
    );
  }
  try {
    const result = await getAndreaniClient().createOrder(
      s.request_payload as AndreaniCreateOrderRequest
    );
    return await applyCreateResult(s.id, result);
  } catch (e) {
    return (await handleCreateFailure(s, e)).shipment;
  }
}

async function pollPending(s: Shipment): Promise<Shipment> {
  if (!s.tracking_number) return s;
  const body = await getAndreaniClient().getOrder(s.tracking_number);
  return transaction(async (client) => {
    const fresh = await shipmentRepository.findById(s.id, client, true);
    if (!fresh || fresh.status !== 'pending') return fresh ?? s;
    return applyOrderResponse(client, fresh, body);
  });
}

async function pollTraces(s: Shipment): Promise<Shipment> {
  if (!s.tracking_number) return s;
  let traces: AndreaniTraceEvent[];
  try {
    traces = await getAndreaniClient().getTraces(s.tracking_number);
  } catch (e) {
    // Sin trazas todavía: no es un error, solo se reprograma.
    if (e instanceof AndreaniError && e.code === 'NOT_FOUND') traces = [];
    else throw e;
  }
  await ingestEvents(s.id, traces.map(traceToEventInput), 'pull');
  return (await shipmentRepository.findById(s.id)) ?? s;
}

async function pollCancelling(s: Shipment): Promise<Shipment> {
  if (!s.tracking_number) return s;
  const answer = await getAndreaniClient().getCancellation(s.tracking_number);
  const state = (answer.state ?? '').trim().toLowerCase();

  return transaction(async (client) => {
    const fresh = await shipmentRepository.findById(s.id, client, true);
    if (!fresh || fresh.status !== 'cancelling') return fresh ?? s;

    if (state.startsWith('acept')) {
      const updated = await shipmentRepository.updateShipment(
        s.id,
        {
          status: 'cancelled',
          cancelled_at: new Date(),
          andreani_state: answer.state,
          next_poll_at: null,
          error_message: null
        },
        client
      );
      await revertOrderToProcessing(
        client,
        s.order_id,
        'Envío Andreani cancelado',
        fresh.tracking_number
      );
      return updated;
    }

    if (state.startsWith('rechaz')) {
      const events = await shipmentRepository.findEvents(s.id, client);
      const status: ShipmentStatus = deriveShipmentStatus(
        events.map((e) => ({
          event: e.event,
          cycle: e.cycle,
          reason: e.reason,
          occurredAt: e.occurred_at
        })),
        fresh.service_type,
        'created'
      );
      const delay = nextPollDelayMinutes(status);
      return shipmentRepository.updateShipment(
        s.id,
        {
          status,
          andreani_state: answer.state,
          error_message: `Cancelación rechazada: ${answer.razon ?? 'sin motivo informado'}`,
          next_poll_at: delay === null ? null : minutesFromNow(delay)
        },
        client
      );
    }

    return shipmentRepository.updateShipment(
      s.id,
      { andreani_state: answer.state, next_poll_at: minutesFromNow(15) },
      client
    );
  });
}

/** Misma lógica por estado para el job de polling y el refresh manual. */
export async function pollShipment(s: Shipment): Promise<Shipment> {
  switch (s.status) {
    case 'requesting':
      return pollRequesting(s);
    case 'pending':
      return pollPending(s);
    case 'cancelling':
      return pollCancelling(s);
    case 'created':
    case 'in_transit':
    case 'out_for_delivery':
    case 'ready_for_pickup':
    case 'delivery_failed':
    case 'returning':
    case 'incident':
      return pollTraces(s);
    default:
      return s;
  }
}

export async function refreshShipment(shipmentId: string): Promise<Shipment> {
  const s = await shipmentRepository.findById(shipmentId);
  if (!s) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
  if (!isAndreaniEnabled()) throw andreaniDisabledError();
  try {
    return await pollShipment(s);
  } catch (e) {
    if (e instanceof AndreaniError) throw andreaniUnavailableError(e);
    throw e;
  }
}
