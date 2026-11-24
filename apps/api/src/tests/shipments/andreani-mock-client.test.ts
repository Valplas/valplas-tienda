import { describe, it, expect } from 'vitest';
import { createMockAndreaniClient } from '../../infrastructure/external/andreani/mock-client.js';
import type { AndreaniCreateOrderRequest } from '../../infrastructure/external/andreani/types.js';

function orderReq(
  idPedido: string,
  destino: AndreaniCreateOrderRequest['destino']
): AndreaniCreateOrderRequest {
  return {
    contrato: '400006711',
    idPedido,
    origen: { sucursal: { id: '10015' } },
    destino,
    remitente: { nombreCompleto: 'Valplas' },
    destinatario: [{ nombreCompleto: 'Cliente Test' }],
    bultos: [{ kilos: 1, volumenCm: 1000 }]
  };
}

const HOME = {
  postal: { codigoPostal: '1406', calle: 'Calle', numero: '1', localidad: 'CABA' }
};

describe('mock andreani client', () => {
  it('quote price is deterministic', async () => {
    const c = createMockAndreaniClient({ stepSeconds: 10 });
    const q = await c.quote({
      postcode: '1406',
      contract: 'x',
      kilos: 2,
      volumeCm3: 1000,
      declaredValue: 100
    });
    expect(q.price).toBe(3000 + 2 * 850);
    expect(q.price).toBe(4700);
  });

  it('createOrder returns 202 then 208 for same idPedido', async () => {
    const c = createMockAndreaniClient({ stepSeconds: 10 });
    const a = await c.createOrder(orderReq('P1', HOME));
    const b = await c.createOrder(orderReq('P1', HOME));
    expect(a.httpStatus).toBe(202);
    expect(b.httpStatus).toBe(208);
    expect(a.body.bultos[0].numeroDeEnvio).toMatch(/^36\d{13}$/);
    expect(b.body.bultos[0].numeroDeEnvio).toBe(a.body.bultos[0].numeroDeEnvio);
    expect(a.body.agrupadorDeBultos?.startsWith('MOCK')).toBe(true);
  });

  it('traces progress with time (home)', async () => {
    let t = 1_000_000;
    const c = createMockAndreaniClient({ stepSeconds: 10, now: () => t });
    const r = await c.createOrder(orderReq('P2', HOME));
    const n = r.body.bultos[0].numeroDeEnvio;
    expect((await c.getTraces(n)).map((e) => e.Evento)).toEqual(['OrdenDeEnvioCreada']);
    t += 10 * 5 * 1000;
    const ev = await c.getTraces(n);
    expect(ev.map((e) => e.Evento)).toEqual([
      'OrdenDeEnvioCreada',
      'Admision',
      'EnvioDespachado',
      'RecepcionEnSucursalDestino',
      'Distribucion',
      'EnvioEntregado'
    ]);
    expect(ev[5].Motivo).toBe('Entregado');
    expect(ev[0].Ciclo).toBe('Distribution');
    expect(ev[0].Fecha).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
  });

  it('traces for branch delivery use ComienzoCustodiaEnSucursal', async () => {
    let t = 0;
    const c = createMockAndreaniClient({ stepSeconds: 1, now: () => t });
    const r = await c.createOrder(orderReq('P3', { sucursal: { id: '10015' } }));
    t += 5000;
    const ev = await c.getTraces(r.body.bultos[0].numeroDeEnvio);
    expect(ev[4].Evento).toBe('ComienzoCustodiaEnSucursal');
    expect(ev[5]).toMatchObject({ Evento: 'EnvioEntregado', Motivo: 'Entregado' });
  });

  it('getLabel returns a PDF buffer', async () => {
    const c = createMockAndreaniClient({ stepSeconds: 10 });
    const l = await c.getLabel('3612345678901');
    expect(l.contentType).toBe('application/pdf');
    expect(l.data.subarray(0, 4).toString()).toBe('%PDF');
    expect(l.data.toString()).toContain('Etiqueta MOCK 3612345678901');
  });

  it('getCancellation is Aceptado after cancelShipment', async () => {
    const c = createMockAndreaniClient({ stepSeconds: 10 });
    const r = await c.createOrder(orderReq('P4', HOME));
    const n = r.body.bultos[0].numeroDeEnvio;
    await c.cancelShipment({ contract: 'x', trackingNumber: n });
    expect((await c.getCancellation(n)).state).toBe('Aceptado');
  });

  it('listBranches returns at least 3 with codigosPostalesAtendidos', async () => {
    const c = createMockAndreaniClient({ stepSeconds: 10 });
    const b = await c.listBranches();
    expect(b.length).toBeGreaterThanOrEqual(3);
    for (const x of b) expect(x.codigosPostalesAtendidos?.length).toBeGreaterThan(0);
  });
});
