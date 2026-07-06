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

function verifySignature(
  xSignature: string,
  xRequestId: string | undefined,
  dataId: string
): boolean {
  const parts = xSignature.split(',');
  const ts = parts.find((p) => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find((p) => p.startsWith('v1='))?.split('=')[1];
  if (!ts || !v1) {
    logger.warn('MP webhook: x-signature malformado (faltan ts o v1)');
    return false;
  }
  // Replay protection: reject notifications older than 5 minutes.
  // MP es inconsistente con la unidad del ts (las docs dicen milisegundos,
  // el simulador del panel firma con segundos): se normaliza SOLO para este
  // chequeo — el HMAC del manifest usa el string crudo tal como vino.
  const tsNum = parseInt(ts, 10);
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  const tsDeltaMs = Date.now() - tsMs;
  if (Math.abs(tsDeltaMs) > 5 * 60 * 1000) {
    logger.warn(
      `MP webhook: ts fuera de la ventana anti-replay (delta ${Math.round(tsDeltaMs / 1000)}s)`
    );
    return false;
  }
  // MP docs: si data.id o x-request-id no vienen en la notificación, se
  // omiten del manifest antes de calcular el HMAC.
  const manifestParts: string[] = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = manifestParts.join(';') + ';';
  const computed = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  // Comparación en tiempo constante para evitar timing attacks sobre la firma
  const computedBuf = Buffer.from(computed, 'hex');
  const receivedBuf = Buffer.from(v1, 'hex');
  const valid =
    computedBuf.length === receivedBuf.length && timingSafeEqual(computedBuf, receivedBuf);
  if (!valid) {
    // Firma bien formada y ts vigente pero HMAC distinto → casi siempre
    // MP_WEBHOOK_SECRET no coincide con el secret del webhook en el panel.
    logger.warn('MP webhook: HMAC no coincide — revisar MP_WEBHOOK_SECRET vs secret del panel');
  }
  return valid;
}

function mapPaymentStatus(mpStatus: string): OrderStatus | null {
  if (mpStatus === 'approved') return 'payment_confirmed';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
  if (mpStatus === 'refunded' || mpStatus === 'charged_back') return 'refunded';
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

    // No loggear los tokens (secrets en logs). Se muestran una sola vez en la
    // respuesta HTML, ya protegida por la verificación de state, para copiarlos a Railway.
    logger.info(
      `MP OAuth: tokens recibidos (user_id=${tokens.user_id}, expira en ~${expiresInDays} días)`
    );

    // La respuesta contiene los tokens una sola vez: no cachear (proxies/browser)
    // y no filtrar el state de la URL vía Referer.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');

    return res.status(200).send(`
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>MercadoPago vinculado</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:640px;margin:0 auto">
  <h2>✅ Cuenta vinculada exitosamente</h2>
  <p><strong>Copiá estos valores ahora</strong> y guardalos en las variables de entorno de Railway. No se vuelven a mostrar.</p>
  <p style="margin-bottom:0.25rem"><code>MP_ACCESS_TOKEN</code></p>
  <pre style="background:#f4f4f5;padding:0.75rem;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${tokens.access_token}</pre>
  <p style="margin-bottom:0.25rem"><code>MP_REFRESH_TOKEN</code></p>
  <pre style="background:#f4f4f5;padding:0.75rem;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${tokens.refresh_token}</pre>
  <ol>
    <li>Pegá ambos valores en las variables de entorno de Railway.</li>
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

    // El manifest de la firma usa el data.id del QUERY tal como lo mandó MP;
    // cuando la notificación viene sin query param (formato real observado en
    // el panel: payment.created sin ?data.id=), MP firma el manifest SIN el
    // término id: — la autenticidad la siguen dando ts + request-id + secret.
    // El id del body se usa entonces solo para consultar el pago: el estado
    // aplicado sale siempre de la API de MP, nunca del body.
    const queryDataId = req.query['data.id'] as string | undefined;
    const manifestDataId = queryDataId?.toLowerCase() ?? '';
    const paymentId = (queryDataId ?? String(data.id)).toLowerCase();

    // Los payment ids de MP son numéricos; el id termina en la URL del GET a
    // la API, así que cualquier otro formato se descarta sin procesar.
    if (!/^\d+$/.test(paymentId)) {
      logger.warn(`MP webhook: data.id con formato inválido — notificación ignorada`);
      return res.status(200).json({ received: true });
    }

    if (!xSignature || !verifySignature(xSignature, xRequestId, manifestDataId)) {
      logger.warn('MP webhook: invalid or missing signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let payment;
    try {
      payment = await fetchPayment(paymentId);
    } catch (error) {
      // Pago inexistente (ej: simulador del panel con id fake): nada que
      // procesar, 200 para que MP no reintente. Otros errores → 5xx (retry).
      if ((error as { status?: number }).status === 404) {
        logger.warn(`MP webhook: payment ${paymentId} no existe en MP — notificación ignorada`);
        return res.status(200).json({ received: true });
      }
      throw error;
    }

    if (!payment.external_reference) {
      return res.status(200).json({ received: true });
    }

    const order = await orderRepository.findOrderByNumber(payment.external_reference);
    if (!order) {
      logger.warn(`MP webhook: order not found for reference ${payment.external_reference}`);
      return res.status(200).json({ received: true });
    }

    const newStatus = mapPaymentStatus(payment.status ?? '');
    // Estados desde los que un `approved` reintentado por MP es un duplicado
    // esperado (la orden ya avanzó), no una transición inválida a loggear.
    const alreadyPaidStatuses: OrderStatus[] = [
      'payment_confirmed',
      'processing',
      'ready_to_ship',
      'shipped',
      'delivered'
    ];

    if (newStatus && VALID_STATUS_TRANSITIONS[order.status].includes(newStatus)) {
      await orderRepository.updateOrderStatus(
        order.id,
        { status: newStatus, payment_id: paymentId, notes: `MP payment ${payment.status}` },
        order.user_id
      );
      logger.info(`MP webhook: order ${order.order_number} → ${newStatus}`);

      // Pago confirmado → la orden entra en preparación sin paso manual del
      // admin (decisión de negocio: el pago aprobado dispara el picking).
      if (newStatus === 'payment_confirmed') {
        await orderRepository.updateOrderStatus(
          order.id,
          {
            status: 'processing',
            notes: 'Preparación iniciada automáticamente al confirmarse el pago'
          },
          order.user_id
        );
        logger.info(`MP webhook: order ${order.order_number} → processing (auto)`);
      }
    } else if (newStatus === 'payment_confirmed' && alreadyPaidStatuses.includes(order.status)) {
      // Reintento/duplicado de una notificación ya procesada: idempotente.
    } else if (newStatus) {
      // Transición no permitida (ej: refund de una orden ya en preparación):
      // no se pisa el estado, pero queda registrado para revisión manual.
      logger.warn(
        `MP webhook: transición inválida ${order.status} → ${newStatus} para orden ${order.order_number} (payment ${paymentId})`
      );
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
