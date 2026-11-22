// Cliente HTTP de Andreani: login/token, mapeo de errores, timeouts y formato de requests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { createHttpAndreaniClient } from '../../infrastructure/external/andreani/http-client.js';
import type { AndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import { AndreaniError, isRetryable } from '../../infrastructure/external/andreani/errors.js';

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const BASE = 'https://andreani.test';

const cfg: AndreaniConfig = {
  mode: 'qa',
  baseUrl: BASE,
  username: 'u',
  password: 'p',
  clientCode: 'CL',
  contracts: { home: 'C1', branch: 'C2', b2b: '' },
  originBranchId: '15',
  sender: { name: 'V', email: 'a@b.com', phone: '1', docType: 'CUIT', docNumber: '2' },
  defaults: { itemWeightKg: 0.5, itemVolumeCm3: 1000 },
  autoCreate: false,
  pollCron: '*/15 * * * *',
  trackingUrlTemplate: '',
  push: { username: '', password: '' },
  mockStepSeconds: 60
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

const loginOk = () => json({}, 200, { 'x-authorization-token': 'T' });

type FetchMock = ReturnType<typeof vi.fn>;

function headerOf(call: unknown[], name: string): string | null {
  const init = call[1] as FetchInit | undefined;
  return new Headers(init?.headers).get(name);
}

const loginCalls = (f: FetchMock) => f.mock.calls.filter((c) => String(c[0]).endsWith('/login'));

let fetchImpl: FetchMock;
const make = () => createHttpAndreaniClient(cfg, fetchImpl as unknown as typeof fetch);

beforeEach(() => {
  fetchImpl = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('login y token', () => {
  it('hace login con Basic auth y lee el token del header', async () => {
    fetchImpl
      .mockResolvedValueOnce(json({}, 200, { 'x-authorization-token': 'T1' }))
      .mockResolvedValueOnce(json({ eventos: [] }));

    await make().getTraces('360000000000001');

    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/login`);
    expect(headerOf(fetchImpl.mock.calls[0], 'authorization')).toBe(
      `Basic ${Buffer.from('u:p').toString('base64')}`
    );
    expect(headerOf(fetchImpl.mock.calls[1], 'x-authorization-token')).toBe('T1');
  });

  it('cae al token del body si no hay header', async () => {
    fetchImpl
      .mockResolvedValueOnce(json({ token: 'T2' }))
      .mockResolvedValueOnce(json({ eventos: [] }));

    await make().getTraces('1');

    expect(headerOf(fetchImpl.mock.calls[1], 'x-authorization-token')).toBe('T2');
  });

  it('cachea el token y hace un solo login con llamadas concurrentes', async () => {
    fetchImpl.mockImplementation(async (url: string) =>
      String(url).endsWith('/login') ? loginOk() : json({ eventos: [] })
    );
    const client = make();

    await Promise.all([client.getTraces('1'), client.getTraces('2'), client.getTraces('3')]);
    await client.getTraces('4');

    expect(loginCalls(fetchImpl)).toHaveLength(1);
  });

  it('reloguea una vez ante 401', async () => {
    fetchImpl
      .mockResolvedValueOnce(json({}, 200, { 'x-authorization-token': 'T1' }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 200, { 'x-authorization-token': 'T2' }))
      .mockResolvedValueOnce(json({ eventos: [] }));

    await expect(make().getTraces('1')).resolves.toEqual([]);

    expect(loginCalls(fetchImpl)).toHaveLength(2);
    expect(headerOf(fetchImpl.mock.calls[3], 'x-authorization-token')).toBe('T2');
  });

  it('dos 401 seguidos terminan en AUTH', async () => {
    fetchImpl.mockImplementation(async (url: string) =>
      String(url).endsWith('/login') ? loginOk() : json({}, 401)
    );

    await expect(make().getTraces('1')).rejects.toMatchObject({ code: 'AUTH' });
    expect(loginCalls(fetchImpl)).toHaveLength(2);
  });
});

describe('errores', () => {
  it('mapea 400 a VALIDATION con fieldErrors', async () => {
    fetchImpl.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(
      json(
        {
          title: 'Error de validación',
          detail: 'El contrato es incorrecto.',
          status: 400,
          errors: [{ field: 'contrato', message: 'El contrato es incorrecto.' }]
        },
        400
      )
    );

    const err = await make()
      .getTraces('1')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AndreaniError);
    const e = err as AndreaniError;
    expect(e.code).toBe('VALIDATION');
    expect(e.status).toBe(400);
    expect(e.fieldErrors[0].field).toBe('contrato');
    expect(e.message).toContain('El contrato es incorrecto.');
    expect(isRetryable(e)).toBe(false);
  });

  it('404 es NOT_FOUND, 5xx es UPSTREAM y fallo de red es NETWORK', async () => {
    fetchImpl
      .mockResolvedValueOnce(loginOk())
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({}, 503))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = make();

    await expect(client.getOrder('1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const up = await client.getOrder('1').catch((e: unknown) => e);
    expect((up as AndreaniError).code).toBe('UPSTREAM');
    expect(isRetryable(up)).toBe(true);
    const net = await client.getOrder('1').catch((e: unknown) => e);
    expect((net as AndreaniError).code).toBe('NETWORK');
    expect(isRetryable(net)).toBe(true);
    expect(isRetryable(new Error('x'))).toBe(false);
  });

  it('corta las cotizaciones a los 8s con TIMEOUT', async () => {
    vi.useFakeTimers();
    fetchImpl.mockImplementation((url: string, init?: FetchInit) => {
      if (String(url).endsWith('/login')) return Promise.resolve(loginOk());
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
    });

    const pending = make()
      .quote({ postcode: '1406', contract: 'C1', kilos: 1, volumeCm3: 1, declaredValue: 1 })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(8000);
    const err = await pending;

    expect((err as AndreaniError).code).toBe('TIMEOUT');
    expect(isRetryable(err)).toBe(true);
  });
});

describe('endpoints autenticados', () => {
  beforeEach(() => {
    fetchImpl.mockResolvedValueOnce(loginOk());
  });

  it('quote arma los params con corchetes y parsea tarifaConIva.total', async () => {
    fetchImpl.mockResolvedValueOnce(
      json({
        pesoAforado: '70',
        tarifaSinIva: { distribucion: '5819.18', total: '5819.18' },
        tarifaConIva: { distribucion: '7041.21', total: '7041.21' }
      })
    );

    const quote = await make().quote({
      postcode: '1406',
      contract: 'C1',
      kilos: 3.5,
      volumeCm3: 12000,
      declaredValue: 10000
    });

    const url = String(fetchImpl.mock.calls[1][0]);
    expect(url).toContain(`${BASE}/v1/tarifas?`);
    expect(url).toContain('cpDestino=1406');
    expect(url).toContain('contrato=C1');
    expect(url).toContain('cliente=CL');
    expect(url).toContain('sucursalOrigen=15');
    expect(url).toContain('bultos%5B0%5D%5Bvolumen%5D=12000');
    expect(url).toContain('bultos%5B0%5D%5Bkilos%5D=3.5');
    expect(url).toContain('bultos%5B0%5D%5BvalorDeclarado%5D=10000');
    expect(quote).toEqual({ price: 7041.21, priceWithoutTax: 5819.18, chargeableWeight: 70 });
  });

  it('quote con total no numérico es UPSTREAM', async () => {
    fetchImpl.mockResolvedValueOnce(
      json({ pesoAforado: '1', tarifaSinIva: { total: '1' }, tarifaConIva: { total: 'abc' } })
    );

    await expect(
      make().quote({ postcode: '1', contract: 'C1', kilos: 1, volumeCm3: 1, declaredValue: 1 })
    ).rejects.toMatchObject({ code: 'UPSTREAM' });
  });

  it('createOrder devuelve 202 y 208 (201 se normaliza a 202)', async () => {
    const body = { estado: 'Pendiente', tipo: 'B2C', bultos: [] };
    fetchImpl.mockResolvedValueOnce(json(body, 208)).mockResolvedValueOnce(json(body, 201));
    const client = make();
    const req = { contrato: 'C1' } as never;

    const dup = await client.createOrder(req);
    const created = await client.createOrder(req);

    expect(dup.httpStatus).toBe(208);
    expect(created.httpStatus).toBe(202);
    expect(String(fetchImpl.mock.calls[1][0])).toBe(`${BASE}/v2/ordenes-de-envio`);
    expect((fetchImpl.mock.calls[1][1] as FetchInit).method).toBe('POST');
  });

  it('getLabel manda Accept y devuelve Buffer', async () => {
    fetchImpl
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/pdf' }
        })
      )
      .mockResolvedValueOnce(
        new Response('^XA', { status: 200, headers: { 'content-type': 'application/zpl' } })
      );
    const client = make();

    const pdf = await client.getLabel('AG1');
    const zpl = await client.getLabel('AG1', 'zpl');

    expect(headerOf(fetchImpl.mock.calls[1], 'accept')).toBe('application/pdf');
    expect(headerOf(fetchImpl.mock.calls[2], 'accept')).toBe('application/zpl');
    expect(String(fetchImpl.mock.calls[1][0])).toBe(`${BASE}/v2/ordenes-de-envio/AG1/etiquetas`);
    expect(Buffer.isBuffer(pdf.data)).toBe(true);
    expect([...pdf.data]).toEqual([1, 2, 3]);
    expect(pdf.contentType).toBe('application/pdf');
    expect(zpl.data.toString()).toBe('^XA');
  });

  it('cancelShipment postea el body de nueva-accion', async () => {
    fetchImpl.mockResolvedValueOnce(json({}, 202));

    await make().cancelShipment({ contract: 'C1', trackingNumber: '360000000000001' });

    expect(String(fetchImpl.mock.calls[1][0])).toBe(`${BASE}/v2/nueva-accion`);
    expect(JSON.parse(String((fetchImpl.mock.calls[1][1] as FetchInit).body))).toEqual({
      accion: 'cancelacion',
      datos: { contrato: 'C1', numeroAndreani: ['360000000000001'] }
    });
  });

  it('getCancellation lee state y razon', async () => {
    fetchImpl.mockResolvedValueOnce(json({ state: 'Rechazado', razon: 'ya procesado' }));

    await expect(make().getCancellation('36')).resolves.toEqual({
      state: 'Rechazado',
      razon: 'ya procesado'
    });
    expect(String(fetchImpl.mock.calls[1][0])).toBe(`${BASE}/v2/nueva-accion/36`);
  });
});

describe('endpoints públicos', () => {
  it('listBranches y listLocalities no hacen login', async () => {
    fetchImpl
      .mockResolvedValueOnce(json([{ id: 1 }]))
      .mockResolvedValueOnce(
        json([{ idDeProvLocalidad: 1, localidad: 'X', provincia: 'Y', codigosPostales: ['1406'] }])
      );
    const client = make();

    await client.listBranches();
    await client.listLocalities('1406');

    expect(loginCalls(fetchImpl)).toHaveLength(0);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/v2/sucursales?canal=B2C`);
    expect(String(fetchImpl.mock.calls[1][0])).toBe(`${BASE}/v1/localidades?codigosPostales=1406`);
  });
});
