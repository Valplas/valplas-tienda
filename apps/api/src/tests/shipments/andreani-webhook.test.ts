// apps/api/src/tests/shipments/andreani-webhook.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: vi.fn()
}));
vi.mock('../../modules/shipments/shipment.repository.js', () => ({
  findByTrackingNumber: vi.fn()
}));
vi.mock('../../modules/shipments/shipment-ingest.js', () => ({
  ingestEvents: vi.fn()
}));
vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { handleAndreaniPush } from '../../modules/shipments/andreani-webhook.controller.js';
import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import * as shipmentRepository from '../../modules/shipments/shipment.repository.js';
import { ingestEvents } from '../../modules/shipments/shipment-ingest.js';
import { isCsrfExempt } from '../../shared/middleware/csrf.middleware.js';
import { isAndreaniWebhookRequest } from '../../shared/middleware/rate-limit.middleware.js';

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

const BODY = {
  IdCliente: '75370294',
  NumeroDeEnvio: '360001046061950',
  Contrato: '400031580',
  Estado: 'Visita',
  FechaEstado: '2025-09-18T09:56:01.4980000-03:00',
  Motivo: 'No fue visitado',
  SubMotivo: 'Rotura de Vehiculo',
  Ciclo: 'Distribution'
};

function run(headers: Record<string, string>, body: unknown) {
  const req = { headers, body } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
  return { req, res, done: handleAndreaniPush(req, res) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAndreaniConfig).mockReturnValue({
    push: { username: 'andreani', password: 's3cret' }
  } as ReturnType<typeof getAndreaniConfig>);
});

describe('Andreani push webhook', () => {
  it('404 when push credentials are empty', async () => {
    vi.mocked(getAndreaniConfig).mockReturnValue({
      push: { username: '', password: '' }
    } as ReturnType<typeof getAndreaniConfig>);
    const { res, done } = run({ authorization: basic('', '') }, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'NOT_FOUND' })
      })
    );
  });

  it('404 when only one credential is empty', async () => {
    vi.mocked(getAndreaniConfig).mockReturnValue({
      push: { username: 'andreani', password: '' }
    } as ReturnType<typeof getAndreaniConfig>);
    const { res, done } = run({ authorization: basic('andreani', '') }, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each([
    ['wrong password', { authorization: basic('andreani', 'nope') }],
    ['wrong user', { authorization: basic('x', 's3cret') }],
    ['missing header', {}],
    ['non-basic scheme', { authorization: 'Bearer abc' }],
    ['different length creds', { authorization: basic('andreani', 's3cret-and-more') }],
    ['password prefix of the real one', { authorization: basic('andreani', 's3cre') }],
    ['scheme without token', { authorization: 'Basic' }],
    ['pathological whitespace', { authorization: `basic\t${'\t'.repeat(50_000)}x` }]
  ])('401 on %s', async (_n, headers) => {
    const { res, done } = run(headers as Record<string, string>, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: '', error: 'No autorizado', status: 'ERROR' });
    expect(ingestEvents).not.toHaveBeenCalled();
  });

  it.each([
    ['lowercase scheme', `basic ${Buffer.from('andreani:s3cret').toString('base64')}`],
    ['tab separator', `Basic\t${Buffer.from('andreani:s3cret').toString('base64')}`],
    ['colon inside password', null]
  ])('accepts valid credentials with %s', async (name, authorization) => {
    if (name === 'colon inside password') {
      vi.mocked(getAndreaniConfig).mockReturnValue({
        push: { username: 'andreani', password: 'a:b:c' }
      } as ReturnType<typeof getAndreaniConfig>);
    }
    vi.mocked(shipmentRepository.findByTrackingNumber).mockResolvedValue({
      id: 'ship-1'
    } as Awaited<ReturnType<typeof shipmentRepository.findByTrackingNumber>>);
    const header = authorization ?? basic('andreani', 'a:b:c');
    const { res, done } = run({ authorization: header }, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ingests event with source 'push' and returns OK", async () => {
    vi.mocked(shipmentRepository.findByTrackingNumber).mockResolvedValue({
      id: 'ship-1'
    } as Awaited<ReturnType<typeof shipmentRepository.findByTrackingNumber>>);
    const { res, done } = run({ authorization: basic('andreani', 's3cret') }, BODY);
    await done;
    expect(shipmentRepository.findByTrackingNumber).toHaveBeenCalledWith('360001046061950');
    expect(ingestEvents).toHaveBeenCalledWith(
      'ship-1',
      [expect.objectContaining({ event: 'Visita', reason: 'No fue visitado' })],
      'push'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Novedad registrada',
      error: '',
      status: 'OK'
    });
  });

  it('unknown NumeroDeEnvio -> 200 ERROR (no retry)', async () => {
    vi.mocked(shipmentRepository.findByTrackingNumber).mockResolvedValue(null);
    const { res, done } = run({ authorization: basic('andreani', 's3cret') }, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: '',
      error: 'Envío desconocido',
      status: 'ERROR'
    });
    expect(ingestEvents).not.toHaveBeenCalled();
  });

  it.each([
    ['missing NumeroDeEnvio', { ...BODY, NumeroDeEnvio: undefined }],
    ['missing Estado', { ...BODY, Estado: '' }],
    ['missing FechaEstado', { ...BODY, FechaEstado: undefined }],
    ['bad date', { ...BODY, FechaEstado: 'ayer' }],
    ['no body', undefined]
  ])('200 ERROR on %s', async (_n, body) => {
    const { res, done } = run({ authorization: basic('andreani', 's3cret') }, body);
    await done;
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR', error: expect.any(String) })
    );
    expect(ingestEvents).not.toHaveBeenCalled();
  });

  it('500 on unexpected internal error so Andreani retries', async () => {
    vi.mocked(shipmentRepository.findByTrackingNumber).mockRejectedValue(new Error('db down'));
    const { res, done } = run({ authorization: basic('andreani', 's3cret') }, BODY);
    await done;
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ERROR' }));
  });
});

describe('middleware exemptions', () => {
  it('csrf exempt', () => {
    expect(isCsrfExempt('/api/webhooks/andreani')).toBe(true);
  });
  it('rate limiter skips the webhook', () => {
    expect(
      isAndreaniWebhookRequest({ method: 'POST', path: '/webhooks/andreani' } as Request)
    ).toBe(true);
    expect(isAndreaniWebhookRequest({ method: 'POST', path: '/webhooks/other' } as Request)).toBe(
      false
    );
  });
});
