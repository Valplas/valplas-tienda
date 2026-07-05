// apps/api/src/tests/payments/webhook.test.ts
//
// Tests del webhook de MercadoPago: verificación de firma HMAC real
// (misma lógica que produce MP: manifest id/request-id/ts) y mapeo de
// estados de pago → estados de orden.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../infrastructure/external/mercadopago.js', () => ({
  fetchPayment: vi.fn(),
  createOrderPreference: vi.fn()
}));

vi.mock('../../modules/orders/order.repository.js', () => ({
  findOrderByNumber: vi.fn(),
  updateOrderStatus: vi.fn()
}));

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { handleWebhook } from '../../modules/payments/payments.controller.js';
import { fetchPayment } from '../../infrastructure/external/mercadopago.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import { logger } from '../../infrastructure/logger/index.js';
import { env } from '../../env.js';

const DATA_ID = '123456789';

/**
 * Firma el manifest igual que MercadoPago.
 * Si xRequestId es undefined, el manifest se construye sin la parte request-id
 * (así lo especifican las docs de MP para notificaciones sin ese header).
 */
function sign(dataId: string, ts: number, xRequestId?: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  const manifest = parts.join(';') + ';';
  const v1 = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function buildReq(overrides?: {
  xSignature?: string;
  xRequestId?: string | undefined;
  dataId?: string;
  type?: string;
}): Request {
  const ts = Date.now();
  const dataId = overrides?.dataId ?? DATA_ID;
  const xRequestId = 'xRequestId' in (overrides ?? {}) ? overrides?.xRequestId : 'req-abc';
  const headers: Record<string, string> = {};
  headers['x-signature'] = overrides?.xSignature ?? sign(dataId, ts, xRequestId);
  if (xRequestId) headers['x-request-id'] = xRequestId;

  return {
    headers,
    query: { 'data.id': dataId },
    body: { type: overrides?.type ?? 'payment', data: { id: dataId } }
  } as unknown as Request;
}

function buildRes(): Response & { statusCode?: number } {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    (res as { statusCode?: number }).statusCode = code;
    return res;
  });
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as Response & { statusCode?: number };
}

const next: NextFunction = vi.fn();

function mockPayment(status: string) {
  vi.mocked(fetchPayment).mockResolvedValue({
    status,
    external_reference: 'VLP-20260705-0001'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function mockOrder(status: string) {
  vi.mocked(orderRepository.findOrderByNumber).mockResolvedValue({
    id: 'order-1',
    order_number: 'VLP-20260705-0001',
    user_id: 'user-1',
    status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(orderRepository.updateOrderStatus).mockResolvedValue({} as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MP webhook: verificación de firma', () => {
  it('acepta una notificación con firma válida y confirma el pago aprobado', async () => {
    mockPayment('approved');
    mockOrder('pending_payment');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'payment_confirmed', payment_id: DATA_ID }),
      'user-1'
    );
  });

  it('rechaza firma inválida con 400 sin consultar el pago', async () => {
    const res = buildRes();

    await handleWebhook(
      buildReq({ xSignature: `ts=${Date.now()},v1=${'0'.repeat(64)}` }),
      res,
      next
    );

    expect(res.statusCode).toBe(400);
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('rechaza notificaciones con ts más viejo que 5 minutos (replay)', async () => {
    const staleTs = Date.now() - 6 * 60 * 1000;
    const res = buildRes();

    await handleWebhook(buildReq({ xSignature: sign(DATA_ID, staleTs, 'req-abc') }), res, next);

    expect(res.statusCode).toBe(400);
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('acepta notificación SIN x-request-id firmada con manifest sin request-id', async () => {
    // Las docs de MP indican: si un valor (data.id, x-request-id) no está presente,
    // se remueve del manifest antes de calcular el HMAC.
    mockPayment('approved');
    mockOrder('pending_payment');
    const res = buildRes();

    await handleWebhook(buildReq({ xRequestId: undefined }), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).toHaveBeenCalled();
  });

  it('responde 200 sin procesar cuando el type no es payment', async () => {
    const res = buildRes();

    await handleWebhook(buildReq({ type: 'merchant_order' }), res, next);

    expect(res.statusCode).toBe(200);
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('rechaza notificación de pago sin data.id en query (campo firmado obligatorio)', async () => {
    // El data.id del query param es el campo que MP firma en el manifest.
    // Aceptar un id alternativo del body desacoplaría la firma del pago
    // consultado — el id del body NUNCA debe usarse para el fetch.
    const ts = Date.now();
    const req = {
      headers: {
        'x-signature': sign('', ts, 'req-abc'),
        'x-request-id': 'req-abc'
      },
      query: {},
      body: { type: 'payment', data: { id: DATA_ID } }
    } as unknown as Request;
    const res = buildRes();

    await handleWebhook(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('responde 200 si el pago notificado no existe en MP (simulador con id fake)', async () => {
    vi.mocked(fetchPayment).mockRejectedValue(
      Object.assign(new Error('Payment not found'), { status: 404 })
    );
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
  });
});

describe('MP webhook: mapeo de estados', () => {
  it('mapea rejected → failed', async () => {
    mockPayment('rejected');
    mockOrder('pending_payment');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'failed' }),
      'user-1'
    );
  });

  it('mapea refunded → refunded (reembolso hecho en el panel de MP)', async () => {
    mockPayment('refunded');
    mockOrder('payment_confirmed');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'refunded' }),
      'user-1'
    );
  });

  it('mapea charged_back → refunded (contracargo)', async () => {
    mockPayment('charged_back');
    mockOrder('payment_confirmed');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ status: 'refunded' }),
      'user-1'
    );
  });

  it('ignora estados pending/in_process (orden queda igual)', async () => {
    mockPayment('pending');
    mockOrder('pending_payment');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('no aplica transición inválida y la loggea (refunded sobre orden processing)', async () => {
    mockPayment('refunded');
    mockOrder('processing');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('notificaciones duplicadas son idempotentes (approved sobre orden ya confirmada)', async () => {
    mockPayment('approved');
    mockOrder('payment_confirmed');
    const res = buildRes();

    await handleWebhook(buildReq(), res, next);

    expect(res.statusCode).toBe(200);
    expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
  });
});
