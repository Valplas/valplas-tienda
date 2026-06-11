import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { fetchPayment } from '../../infrastructure/external/mercadopago.js';
import * as orderRepository from '../orders/order.repository.js';
import { VALID_STATUS_TRANSITIONS } from '../orders/order.types.js';
import type { OrderStatus } from '../orders/order.types.js';
import { env } from '../../env.js';
import { logger } from '../../infrastructure/logger/index.js';

interface MPOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  user_id: number;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
  message?: string;
}

function verifySignature(xSignature: string, xRequestId: string, dataId: string): boolean {
  const parts = xSignature.split(',');
  const ts = parts.find((p) => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find((p) => p.startsWith('v1='))?.split('=')[1];
  if (!ts || !v1) return false;
  // Replay protection: reject notifications older than 5 minutes
  if (Math.abs(Date.now() - parseInt(ts, 10)) > 5 * 60 * 1000) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  // Comparación en tiempo constante para evitar timing attacks sobre la firma
  const computedBuf = Buffer.from(computed, 'hex');
  const receivedBuf = Buffer.from(v1, 'hex');
  if (computedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(computedBuf, receivedBuf);
}

function mapPaymentStatus(mpStatus: string): OrderStatus | null {
  if (mpStatus === 'approved') return 'payment_confirmed';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
  return null;
}

export async function handleOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error) {
      logger.warn(`MP OAuth: authorization denied — ${error}`);
      return res.status(400).send('Autorización rechazada por el usuario.');
    }

    if (!code) {
      return res.status(400).send('Parámetro code ausente.');
    }

    if (!env.MP_OAUTH_STATE || state !== env.MP_OAUTH_STATE) {
      logger.warn('MP OAuth: state mismatch — posible ataque CSRF');
      return res.status(403).send('State inválido.');
    }

    if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) {
      logger.error('MP OAuth: MP_CLIENT_ID o MP_CLIENT_SECRET no configurados');
      return res.status(500).send('Configuración de OAuth incompleta.');
    }

    const tokenResponse = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.MP_CLIENT_ID,
        client_secret: env.MP_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${env.API_URL}/api/payments/oauth/callback`,
        test_token: env.IS_PRODUCTION ? 'false' : 'true'
      })
    });

    const tokens = (await tokenResponse.json()) as MPOAuthTokenResponse;

    if (!tokenResponse.ok || tokens.error) {
      logger.error(`MP OAuth token exchange failed: ${tokens.message ?? tokens.error}`);
      return res.status(500).send('Error al intercambiar el código por tokens. Revisá los logs.');
    }

    const expiresInDays = Math.round(tokens.expires_in / 86400);

    logger.info('=== MP OAUTH TOKENS — GUARDAR EN RAILWAY INMEDIATAMENTE ===');
    logger.info(`MP_ACCESS_TOKEN=${tokens.access_token}`);
    logger.info(`MP_REFRESH_TOKEN=${tokens.refresh_token}`);
    logger.info(`user_id=${tokens.user_id}`);
    logger.info(`expires_in=${tokens.expires_in}s (~${expiresInDays} días)`);
    logger.info('============================================================');

    return res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>MercadoPago vinculado</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto">
  <h2>✅ Cuenta vinculada exitosamente</h2>
  <p>La cuenta de MercadoPago fue autorizada correctamente.</p>
  <ol>
    <li>Revisá los <strong>logs del servidor en Railway</strong> para copiar el <code>MP_ACCESS_TOKEN</code> y <code>MP_REFRESH_TOKEN</code>.</li>
    <li>Actualizá esas variables de entorno en Railway.</li>
    <li>Reiniciá el servicio.</li>
  </ol>
  <hr>
  <p style="color:#666;font-size:0.875rem">
    user_id: ${tokens.user_id} &mdash; expira en ~${expiresInDays} días
  </p>
</body>
</html>`);
  } catch (error) {
    next(error);
  }
}

export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const xSignature = req.headers['x-signature'] as string | undefined;
    const xRequestId = req.headers['x-request-id'] as string | undefined;
    const { type, data } = req.body as { type?: string; data?: { id?: unknown } };

    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ received: true });
    }

    // MP docs: use query param data.id (lowercase) for signature manifest, not body
    const queryDataId = req.query['data.id'] as string | undefined;
    const dataId = (queryDataId ?? String(data.id)).toLowerCase();

    if (!xSignature || !xRequestId || !verifySignature(xSignature, xRequestId, dataId)) {
      logger.warn('MP webhook: invalid or missing signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payment = await fetchPayment(dataId);

    if (!payment.external_reference) {
      return res.status(200).json({ received: true });
    }

    const order = await orderRepository.findOrderByNumber(payment.external_reference);
    if (!order) {
      logger.warn(`MP webhook: order not found for reference ${payment.external_reference}`);
      return res.status(200).json({ received: true });
    }

    const newStatus = mapPaymentStatus(payment.status ?? '');
    if (newStatus && VALID_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
      await orderRepository.updateOrderStatus(
        order.id,
        { status: newStatus, payment_id: dataId, notes: `MP payment ${payment.status}` },
        order.user_id
      );
      logger.info(`MP webhook: order ${order.order_number} → ${newStatus}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
