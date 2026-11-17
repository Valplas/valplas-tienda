// apps/api/src/infrastructure/external/bot-webhook.client.ts
//
// Envío de webhooks firmados al bot de WhatsApp. Contrato (headers, firma, body) documentado
// en docs/BOT_API.md → "Webhook saliente".

import { createHmac } from 'crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'X-Valplas-Signature';
export const WEBHOOK_EVENT_ID_HEADER = 'X-Valplas-Event-Id';
export const WEBHOOK_EVENT_TYPE_HEADER = 'X-Valplas-Event-Type';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Firma estilo Stripe: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
 * El timestamp entra en la firma para que el receptor pueda rechazar reenvíos viejos (replay).
 */
export function signWebhookBody(rawBody: string, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export interface BotWebhookRequest {
  url: string;
  secret: string;
  eventId: string;
  eventType: string;
  body: unknown;
  timeoutMs?: number;
}

/** POST del evento. Tira error si no responde 2xx dentro del timeout (el job reintenta). */
export async function sendBotWebhook(request: BotWebhookRequest): Promise<void> {
  const rawBody = JSON.stringify(request.body);
  const timestamp = Math.floor(Date.now() / 1000);

  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(rawBody, request.secret, timestamp),
      [WEBHOOK_EVENT_ID_HEADER]: request.eventId,
      [WEBHOOK_EVENT_TYPE_HEADER]: request.eventType
    },
    body: rawBody,
    signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`El bot respondió HTTP ${response.status}`);
  }
}
