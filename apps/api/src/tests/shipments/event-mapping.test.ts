import { describe, expect, it } from 'vitest';
import {
  deriveShipmentStatus,
  mapEvent,
  orderTargetFor,
  parseAndreaniDate,
  pushToEventInput,
  traceToEventInput
} from '../../modules/shipments/event-mapping.js';
import type { ServiceType, ShipmentStatus } from '../../modules/shipments/shipment.types.js';

type Row = [string, string | null, string | null, ServiceType, ShipmentStatus | null];

describe('mapEvent', () => {
  it.each<Row>([
    ['OrdenDeEnvioCreada', null, null, 'home_delivery', 'created'],
    ['OrdenDeEnvioRechazada', null, null, 'home_delivery', 'rejected'],
    ['Admision', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['AltaAutomatica', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['AltaManual', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['EnvioConsolidado', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['EnvioDespachado', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['ExpedicionHojaDeRutaSucursal', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['RecepcionEnSucursalDestino', 'Distribution', null, 'home_delivery', 'in_transit'],
    ['RecepcionEnSucursalDestino', 'Distribution', null, 'branch_pickup', 'ready_for_pickup'],
    ['ComienzoCustodiaEnSucursal', 'Distribution', null, 'branch_pickup', 'ready_for_pickup'],
    ['ComienzoCustodiaEnSucursal', 'Distribution', null, 'home_delivery', 'ready_for_pickup'],
    ['Distribucion', 'Distribution', null, 'home_delivery', 'out_for_delivery'],
    ['Visita', 'Distribution', 'Rehusado', 'home_delivery', 'delivery_failed'],
    ['Visita', 'Distribution', null, 'home_delivery', 'delivery_failed'],
    ['Visita', 'Distribution', 'Entregado', 'home_delivery', 'delivered'],
    ['Visita', 'DIRECTO', 'entregado por mostrador', 'branch_pickup', 'delivered'],
    ['EnvioEntregado', 'Distribution', null, 'home_delivery', 'delivered'],
    ['EnvioEntregado', 'DIRECTO', null, 'home_delivery', 'delivered'],
    ['EnvioEntregado', 'Resend', null, 'home_delivery', 'delivered'],
    ['EnvioEntregado', 'Reenvio', null, 'home_delivery', 'delivered'],
    ['EnvioNoEntregado', 'Distribution', null, 'home_delivery', 'returning'],
    ['SolicitudDeRescate', 'Rescate', null, 'home_delivery', 'returning'],
    ['Rescate', 'Rescate', null, 'home_delivery', 'returning'],
    ['Impresion', 'Drop', null, 'home_delivery', 'returning'],
    ['ComienzoCustodiaEnSucursal', 'Drop', null, 'branch_pickup', 'returning'],
    ['ComienzoCustodiaEnSucursal', 'Devolucion', 'Entregado', 'home_delivery', 'returning'],
    ['Admision', 'Devolucion', null, 'home_delivery', 'returning'],
    ['AltaAutomatica', 'Drop', null, 'home_delivery', 'returning'],
    ['Distribucion', 'DEVOLUCION', null, 'home_delivery', 'returning'],
    ['Siniestro', 'Drop', null, 'home_delivery', 'incident'],
    ['EnvioAnulado', 'Devolucion', null, 'home_delivery', 'cancelled'],
    ['EnvioEntregado', 'Devolucion', null, 'home_delivery', 'returned'],
    ['EnvioEntregado', 'DEVOLUCION', null, 'home_delivery', 'returned'],
    ['EnvioRendido', 'Distribution', null, 'home_delivery', 'returned'],
    ['Siniestro', 'Siniestro', null, 'home_delivery', 'incident'],
    ['RoturaTotal', 'Siniestro', null, 'home_delivery', 'incident'],
    ['EnvioAnulado', 'Distribution', null, 'home_delivery', 'cancelled'],
    ['GestionTelefonica', 'Distribution', null, 'home_delivery', null],
    ['NuevaFechaDeEntregaPactada', 'Distribution', null, 'home_delivery', null],
    ['Impresion', 'Distribution', null, 'home_delivery', null],
    ['EventoDesconocido', null, null, 'home_delivery', null]
  ])('%s (%s, %s, %s) -> %s', (event, cycle, reason, service, expected) => {
    expect(mapEvent({ event, cycle, reason }, service)).toBe(expected);
  });
});

describe('parseAndreaniDate', () => {
  it('parses offset-less Fecha as -03:00', () => {
    expect(parseAndreaniDate('2025-10-08T12:19:04.054').toISOString()).toBe(
      '2025-10-08T15:19:04.054Z'
    );
  });
  it('respects explicit offset and Z', () => {
    expect(parseAndreaniDate('2025-10-08T12:19:04.054-05:00').toISOString()).toBe(
      '2025-10-08T17:19:04.054Z'
    );
    expect(parseAndreaniDate('2025-10-08T12:19:04Z').toISOString()).toBe(
      '2025-10-08T12:19:04.000Z'
    );
  });
  it('handles 7-digit fractional seconds', () => {
    expect(parseAndreaniDate('2025-09-18T09:56:01.4980000-03:00').toISOString()).toBe(
      '2025-09-18T12:56:01.498Z'
    );
  });
  it('is deterministic', () => {
    const a = parseAndreaniDate('2025-10-08T12:19:04.054').getTime();
    expect(parseAndreaniDate('2025-10-08T12:19:04.054').getTime()).toBe(a);
  });
  it('throws on invalid input', () => {
    expect(() => parseAndreaniDate('nope')).toThrow();
  });
});

describe('event inputs', () => {
  it('traceToEventInput maps fields', () => {
    const raw = {
      Fecha: '2025-10-08T12:19:04.054',
      Ciclo: 'Distribution',
      Evento: 'Visita',
      Motivo: 'Rehusado',
      Submotivo: 'x',
      Estado: 'Visita',
      Sucursal: 'Sucursal A',
      SucursalId: '12',
      Comentario: 'c'
    };
    expect(traceToEventInput(raw)).toEqual({
      occurredAt: new Date('2025-10-08T15:19:04.054Z'),
      cycle: 'Distribution',
      event: 'Visita',
      reason: 'Rehusado',
      subReason: 'x',
      statusLabel: 'Visita',
      branchName: 'Sucursal A',
      branchId: '12',
      comment: 'c',
      raw
    });
  });
  it('traceToEventInput nulls missing fields', () => {
    const r = traceToEventInput({ Fecha: '2025-10-08T12:19:04', Ciclo: '', Evento: 'Admision' });
    expect(r.cycle).toBeNull();
    expect(r.reason).toBeNull();
    expect(r.branchId).toBeNull();
  });
  it('pushToEventInput maps fields', () => {
    const p = {
      NumeroDeEnvio: '360',
      Estado: 'EnvioEntregado',
      FechaEstado: '2025-09-18T09:56:01.4980000-03:00',
      Motivo: 'm',
      SubMotivo: 's',
      Ciclo: 'DIRECTO'
    };
    const r = pushToEventInput(p);
    expect(r.event).toBe('EnvioEntregado');
    expect(r.occurredAt.toISOString()).toBe('2025-09-18T12:56:01.498Z');
    expect(r.cycle).toBe('DIRECTO');
    expect(r.reason).toBe('m');
    expect(r.subReason).toBe('s');
    expect(r.statusLabel).toBeNull();
    expect(r.raw).toBe(p);
  });
});

describe('deriveShipmentStatus', () => {
  const ev = (
    event: string,
    iso: string,
    cycle: string | null = 'Distribution',
    reason: string | null = null
  ) => ({ event, cycle, reason, occurredAt: new Date(iso) });

  it('returns fallback with no mapped events', () => {
    expect(
      deriveShipmentStatus(
        [ev('GestionTelefonica', '2025-01-01T00:00:00Z')],
        'home_delivery',
        'created'
      )
    ).toBe('created');
    expect(deriveShipmentStatus([], 'home_delivery', 'pending')).toBe('pending');
  });

  it('sorts by occurredAt (out-of-order gives same result)', () => {
    const events = [
      ev('Distribucion', '2025-01-02T00:00:00Z'),
      ev('Admision', '2025-01-01T00:00:00Z'),
      ev('EnvioEntregado', '2025-01-03T00:00:00Z')
    ];
    expect(deriveShipmentStatus(events, 'home_delivery', 'created')).toBe('delivered');
    expect(deriveShipmentStatus([...events].reverse(), 'home_delivery', 'created')).toBe(
      'delivered'
    );
  });

  it('delivered is sticky against later Distribucion', () => {
    expect(
      deriveShipmentStatus(
        [ev('EnvioEntregado', '2025-01-02T00:00:00Z'), ev('Distribucion', '2025-01-03T00:00:00Z')],
        'home_delivery',
        'created'
      )
    ).toBe('delivered');
  });

  it('return-cycle event after delivery_failed -> returning', () => {
    expect(
      deriveShipmentStatus(
        [
          ev('Visita', '2025-01-02T00:00:00Z', 'Distribution', 'Rehusado'),
          ev('Impresion', '2025-01-03T00:00:00Z', 'Devolucion')
        ],
        'home_delivery',
        'created'
      )
    ).toBe('returning');
  });

  it('returned and cancelled are sticky; returning can reach returned', () => {
    expect(
      deriveShipmentStatus(
        [
          ev('EnvioNoEntregado', '2025-01-02T00:00:00Z'),
          ev('EnvioEntregado', '2025-01-03T00:00:00Z', 'Devolucion'),
          ev('Distribucion', '2025-01-04T00:00:00Z')
        ],
        'home_delivery',
        'created'
      )
    ).toBe('returned');
    expect(
      deriveShipmentStatus(
        [ev('EnvioAnulado', '2025-01-02T00:00:00Z'), ev('Admision', '2025-01-03T00:00:00Z')],
        'home_delivery',
        'created'
      )
    ).toBe('cancelled');
  });

  it('return-cycle movement keeps returning', () => {
    expect(
      deriveShipmentStatus(
        [
          ev('Admision', '2025-01-01T00:00:00Z'),
          ev('EnvioNoEntregado', '2025-01-02T00:00:00Z'),
          ev('Admision', '2025-01-03T00:00:00Z', 'Drop'),
          ev('ComienzoCustodiaEnSucursal', '2025-01-04T00:00:00Z', 'Drop')
        ],
        'home_delivery',
        'created'
      )
    ).toBe('returning');
  });

  it('uses service type for branch custody', () => {
    expect(
      deriveShipmentStatus(
        [ev('RecepcionEnSucursalDestino', '2025-01-02T00:00:00Z')],
        'branch_pickup',
        'created'
      )
    ).toBe('ready_for_pickup');
  });
});

describe('orderTargetFor', () => {
  it.each<[ShipmentStatus, string | null]>([
    ['created', 'ready_to_ship'],
    ['in_transit', 'shipped'],
    ['out_for_delivery', 'shipped'],
    ['ready_for_pickup', 'shipped'],
    ['delivery_failed', 'shipped'],
    ['returning', 'shipped'],
    ['incident', 'shipped'],
    ['delivered', 'delivered'],
    ['returned', null],
    ['cancelled', null],
    ['rejected', null],
    ['requesting', null],
    ['pending', null],
    ['error', null]
  ])('%s -> %s', (status, expected) => {
    expect(orderTargetFor(status)).toBe(expected);
  });
});
