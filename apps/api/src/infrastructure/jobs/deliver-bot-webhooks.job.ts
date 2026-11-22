import cron, { type ScheduledTask } from 'node-cron';
import * as outboxRepository from '../../modules/bot/outbound-webhook.repository.js';
import type { ClaimedWebhookEvent } from '../../modules/bot/outbound-webhook.repository.js';
import { STATUS_LABELS } from '../../modules/orders/order.types.js';
import { sendBotWebhook, type BotWebhookRequest } from '../external/bot-webhook.client.js';
import { env } from '../../env.js';
import { logger } from '../logger/index.js';

const BATCH_SIZE = 20;
/** Lease del reclamo: cubre BATCH_SIZE entregas secuenciales de hasta 5s cada una. */
const LEASE_SECONDS = 120;
/** Espera antes de cada reintento, según el intento que falló (1º, 2º, ...). */
export const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 7200, 21600, 21600];
/** Intentos totales antes de marcar el evento como fallido definitivo. */
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const RETENTION_DAYS = 30;

/** Body del webhook (sale tal cual, en camelCase: no pasa por el middleware de la API). */
export function buildWebhookBody(event: ClaimedWebhookEvent) {
  return {
    id: event.id,
    type: event.event_type,
    // jsonb guarda el timestamp como texto de Postgres (+00:00, microsegundos): ISO 8601 en UTC
    occurredAt: new Date(event.payload.occurred_at).toISOString(),
    data: {
      orderNumber: event.payload.order_number,
      status: event.payload.status,
      statusLabel: STATUS_LABELS[event.payload.status] ?? event.payload.status,
      previousStatus: event.payload.previous_status,
      total: Number(event.payload.total),
      customer: {
        id: event.customer_id,
        phone: event.customer_phone,
        firstName: event.customer_first_name
      }
    }
  };
}

export interface DeliveryConfig {
  url: string;
  secret: string;
  send?: (request: BotWebhookRequest) => Promise<void>;
}

export interface DeliveryResult {
  delivered: number;
  retried: number;
  failed: number;
}

/**
 * Entrega un lote de eventos pendientes del canal WhatsApp. Secuencial a propósito: respeta el
 * orden de los cambios de estado de cada orden y no le pega en ráfaga al bot.
 */
export async function deliverBotWebhooks(config: DeliveryConfig): Promise<DeliveryResult> {
  const send = config.send ?? sendBotWebhook;
  const events = await outboxRepository.claimPendingEvents('whatsapp', BATCH_SIZE, LEASE_SECONDS);
  const result: DeliveryResult = { delivered: 0, retried: 0, failed: 0 };
  const deliveredIds: string[] = [];

  for (const event of events) {
    try {
      await send({
        url: config.url,
        secret: config.secret,
        eventId: event.id,
        eventType: event.event_type,
        body: buildWebhookBody(event)
      });
      deliveredIds.push(event.id);
      result.delivered++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // attempts ya incluye este intento (lo incrementa el reclamo): 1..MAX_ATTEMPTS
      const retryIn =
        event.attempts >= MAX_ATTEMPTS ? null : RETRY_DELAYS_SECONDS[event.attempts - 1];
      await outboxRepository.markAttemptFailed(event.id, message, retryIn);

      if (retryIn === null) {
        result.failed++;
        logger.error(
          `[bot-webhooks] Evento ${event.id} (${event.payload.order_number} → ${event.payload.status}) descartado tras ${event.attempts} intentos: ${message}`
        );
      } else {
        result.retried++;
        logger.warn(
          `[bot-webhooks] Evento ${event.id} falló (intento ${event.attempts}), reintento en ${retryIn}s: ${message}`
        );
      }
    }
  }

  await outboxRepository.markDelivered(deliveredIds);
  return result;
}

let running = false;
let warnedMissingConfig = false;

async function runDelivery(): Promise<void> {
  if (!env.BOT_WEBHOOK_URL || !env.BOT_WEBHOOK_SECRET) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      logger.warn(
        '[bot-webhooks] BOT_WEBHOOK_URL/BOT_WEBHOOK_SECRET sin configurar: los eventos quedan encolados sin enviarse'
      );
    }
    return;
  }

  // Una corrida a la vez por proceso (un lote lento no se superpone con el siguiente tick)
  if (running) return;
  running = true;
  try {
    const result = await deliverBotWebhooks({
      url: env.BOT_WEBHOOK_URL,
      secret: env.BOT_WEBHOOK_SECRET
    });
    if (result.delivered + result.retried + result.failed > 0) {
      logger.info(
        `[bot-webhooks] entregados ${result.delivered}, reintentos ${result.retried}, fallidos ${result.failed}`
      );
    }
  } finally {
    running = false;
  }
}

/**
 * Entrega cada 15 segundos los cambios de estado de órdenes WSP al bot, y una vez por día
 * (06:45 UTC) borra los eventos de más de RETENTION_DAYS días.
 */
export function scheduleBotWebhookDelivery(): ScheduledTask[] {
  const delivery = cron.schedule('*/15 * * * * *', async () => {
    try {
      await runDelivery();
    } catch (error) {
      logger.error(
        `[bot-webhooks] Error durante la corrida: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  const pruning = cron.schedule('45 6 * * *', async () => {
    try {
      const pruned = await outboxRepository.pruneEventsOlderThan(RETENTION_DAYS);
      if (pruned > 0) logger.info(`[bot-webhooks] ${pruned} eventos viejos borrados`);
    } catch (error) {
      logger.error(
        `[bot-webhooks] Error borrando eventos viejos: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  return [delivery, pruning];
}
