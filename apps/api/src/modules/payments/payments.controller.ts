import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { fetchPayment } from '../../infrastructure/external/mercadopago.js';
import * as orderRepository from '../orders/order.repository.js';
import { VALID_STATUS_TRANSITIONS } from '../orders/order.types.js';
import type { OrderStatus } from '../orders/order.types.js';
import { env } from '../../env.js';
import { logger } from '../../infrastructure/logger/index.js';

function verifySignature(xSignature: string, xRequestId: string, dataId: string): boolean {
  const parts = xSignature.split(',');
  const ts = parts.find((p) => p.startsWith('ts='))?.split('=')[1];
  const v1 = parts.find((p) => p.startsWith('v1='))?.split('=')[1];
  if (!ts || !v1) return false;
  // Replay protection: reject notifications older than 5 minutes
  if (Math.abs(Date.now() - parseInt(ts, 10)) > 5 * 60 * 1000) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  return computed === v1;
}

function mapPaymentStatus(mpStatus: string): OrderStatus | null {
  if (mpStatus === 'approved') return 'payment_confirmed';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'failed';
  return null;
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

    if (env.NODE_ENV !== 'development') {
      if (!xSignature || !xRequestId || !verifySignature(xSignature, xRequestId, dataId)) {
        logger.warn('MP webhook: invalid or missing signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
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
