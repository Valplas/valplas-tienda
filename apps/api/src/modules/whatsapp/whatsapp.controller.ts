import type { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../env.js';
import { processMessage } from './whatsapp.service.js';
import type { WhatsAppWebhookPayload } from './whatsapp.types.js';

/**
 * GET /webhooks/whatsapp
 * Verificación del webhook por Meta.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

/**
 * POST /webhooks/whatsapp
 * Recibe mensajes entrantes. Valida firma HMAC-SHA256 antes de procesar.
 */
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  // Verificar firma
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature || !env.WHATSAPP_APP_SECRET) {
    res.sendStatus(401);
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.sendStatus(400);
    return;
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.sendStatus(401);
    return;
  }

  // Responder 200 inmediatamente (Meta requiere respuesta rápida)
  res.sendStatus(200);

  // Procesar mensajes en background
  const payload = req.body as WhatsAppWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value.messages ?? []) {
        if (message.type !== 'text') continue; // Solo procesamos texto en MVP
        processMessage(message).catch((err: unknown) => {
          console.error('[WhatsApp] Error procesando mensaje:', err);
        });
      }
    }
  }
}
