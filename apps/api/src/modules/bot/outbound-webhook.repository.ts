// apps/api/src/modules/bot/outbound-webhook.repository.ts
//
// Outbox de webhooks salientes (tabla outbound_webhook_events, migración 051). El trigger
// enqueue_order_status_webhook encola; este repo reclama, marca entregados y reprograma.

import { query } from '../../infrastructure/database/client.js';
import type { OrderStatus, SalesChannel } from '../orders/order.types.js';

export interface ClaimedWebhookEvent {
  id: string;
  event_type: string;
  attempts: number;
  payload: {
    order_id: string;
    order_number: string;
    status: OrderStatus;
    previous_status: OrderStatus;
    total: number;
    occurred_at: string;
  };
  customer_id: string;
  customer_phone: string | null;
  customer_first_name: string;
}

/**
 * Reclama hasta `limit` eventos pendientes y vencidos del canal y los "alquila" por
 * `leaseSeconds` (next_attempt_at en el futuro): si el proceso muere a mitad de la entrega, se
 * reintentan al vencer el lease. FOR UPDATE SKIP LOCKED hace seguro correrlo en varias
 * instancias a la vez. Trae los datos del cliente en la misma query (sin N+1).
 */
export async function claimPendingEvents(
  channel: SalesChannel,
  limit: number,
  leaseSeconds: number
): Promise<ClaimedWebhookEvent[]> {
  const result = await query<ClaimedWebhookEvent>(
    `WITH claimed AS (
       UPDATE outbound_webhook_events e
       SET attempts = e.attempts + 1,
           next_attempt_at = NOW() + make_interval(secs => $3)
       WHERE e.id IN (
         SELECT id FROM outbound_webhook_events
         WHERE channel = $1
           AND delivered_at IS NULL AND failed_at IS NULL
           AND next_attempt_at <= NOW()
         ORDER BY created_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING e.id, e.order_id, e.event_type, e.payload, e.attempts, e.created_at
     )
     SELECT c.id, c.event_type, c.payload, c.attempts,
            u.id AS customer_id, u.phone AS customer_phone, u.first_name AS customer_first_name
     FROM claimed c
     JOIN orders o ON o.id = c.order_id
     JOIN users u ON u.id = o.user_id
     ORDER BY c.created_at`,
    [channel, limit, leaseSeconds]
  );

  return result.rows;
}

export async function markDelivered(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `UPDATE outbound_webhook_events
     SET delivered_at = NOW(), last_error = NULL
     WHERE id = ANY($1)`,
    [ids]
  );
}

/** Reprograma un evento fallido; con `retryInSeconds` null queda como fallido definitivo. */
export async function markAttemptFailed(
  id: string,
  error: string,
  retryInSeconds: number | null
): Promise<void> {
  if (retryInSeconds === null) {
    await query(
      `UPDATE outbound_webhook_events
       SET failed_at = NOW(), last_error = $2
       WHERE id = $1`,
      [id, error.slice(0, 1000)]
    );
    return;
  }

  await query(
    `UPDATE outbound_webhook_events
     SET next_attempt_at = NOW() + make_interval(secs => $3), last_error = $2
     WHERE id = $1`,
    [id, error.slice(0, 1000), retryInSeconds]
  );
}

/** Borra eventos viejos (entregados, fallidos o nunca enviados) para acotar la tabla. */
export async function pruneEventsOlderThan(days: number): Promise<number> {
  const result = await query(
    `DELETE FROM outbound_webhook_events
     WHERE created_at < NOW() - make_interval(days => $1)`,
    [days]
  );
  return result.rowCount ?? 0;
}
