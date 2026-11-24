import type { AndreaniTraceEvent } from '../../infrastructure/external/andreani/types.js';
import type { ServiceType, ShipmentStatus } from './shipment.types.js';

/** Evento normalizado (de pull `getTraces` o push webhook) listo para guardar en `shipment_events`. */
export interface ShipmentEventInput {
  occurredAt: Date;
  cycle: string | null;
  event: string;
  reason: string | null;
  subReason: string | null;
  statusLabel: string | null;
  branchName: string | null;
  branchId: string | null;
  comment: string | null;
  raw: unknown;
}

export interface AndreaniPushPayload {
  IdCliente?: string;
  NumeroDeEnvio: string;
  Contrato?: string;
  Estado: string;
  FechaEstado: string;
  Motivo?: string;
  SubMotivo?: string;
  Ciclo?: string;
}

// Ciclos principales (distribution, directo, resend, reenvio): todo lo que no es de devolución.
const RETURN_CYCLES: ReadonlySet<string> = new Set(['drop', 'devolucion', 'rescate']);
/** Estados de los que un evento posterior no puede sacar al envío. */
const STICKY_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  'delivered',
  'returned',
  'cancelled'
]);

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Andreani devuelve fechas sin offset (hora Argentina) o con offset explícito.
 * Sin offset se asume -03:00. Determinístico: la ingesta deduplica por `occurred_at`.
 */
export function parseAndreaniDate(s: string): Date {
  const input = (s ?? '').trim();
  // Normaliza la fracción de segundos a 3 dígitos (push manda 7).
  const normalized = input.replace(
    /\.(\d+)/,
    (_m, frac: string) => `.${frac.slice(0, 3).padEnd(3, '0')}`
  );
  const withOffset = OFFSET_RE.test(normalized) ? normalized : `${normalized}-03:00`;
  const date = new Date(withOffset);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input) || Number.isNaN(date.getTime())) {
    throw new Error(`Fecha de Andreani inválida: "${s}"`);
  }
  return date;
}

const orNull = (v: string | undefined | null): string | null => (v ? v : null);

export function traceToEventInput(t: AndreaniTraceEvent): ShipmentEventInput {
  return {
    occurredAt: parseAndreaniDate(t.Fecha),
    cycle: orNull(t.Ciclo),
    event: t.Evento,
    reason: orNull(t.Motivo),
    subReason: orNull(t.Submotivo),
    statusLabel: orNull(t.Estado),
    branchName: orNull(t.Sucursal),
    branchId: orNull(t.SucursalId),
    comment: orNull(t.Comentario),
    raw: t
  };
}

export function pushToEventInput(p: AndreaniPushPayload): ShipmentEventInput {
  return {
    occurredAt: parseAndreaniDate(p.FechaEstado),
    cycle: orNull(p.Ciclo),
    event: p.Estado,
    reason: orNull(p.Motivo),
    subReason: orNull(p.SubMotivo),
    statusLabel: null,
    branchName: null,
    branchId: null,
    comment: null,
    raw: p
  };
}

type MapInput = Pick<ShipmentEventInput, 'event' | 'cycle' | 'reason'>;
type Rule = (e: { cycle: string; reason: string }, serviceType: ServiceType) => ShipmentStatus;

const isReturnCycle = (cycle: string): boolean => RETURN_CYCLES.has(cycle);

const toInTransit: Rule = () => 'in_transit';

/** Reglas por nombre exacto de evento. */
const EVENT_RULES: Record<string, Rule> = {
  OrdenDeEnvioCreada: () => 'created',
  OrdenDeEnvioRechazada: () => 'rejected',
  Admision: toInTransit,
  AltaAutomatica: toInTransit,
  AltaManual: toInTransit,
  EnvioConsolidado: toInTransit,
  EnvioDespachado: toInTransit,
  RecepcionEnSucursalDestino: (_e, service) =>
    service === 'branch_pickup' ? 'ready_for_pickup' : 'in_transit',
  ComienzoCustodiaEnSucursal: () => 'ready_for_pickup',
  Distribucion: () => 'out_for_delivery',
  Visita: ({ cycle, reason }) => {
    if (reason.startsWith('entregado')) return isReturnCycle(cycle) ? 'returned' : 'delivered';
    return 'delivery_failed';
  },
  EnvioEntregado: ({ cycle }) => (isReturnCycle(cycle) ? 'returned' : 'delivered'),
  EnvioRendido: () => 'returned',
  EnvioNoEntregado: () => 'returning',
  SolicitudDeRescate: () => 'returning',
  Rescate: () => 'returning',
  Siniestro: () => 'incident',
  RoturaTotal: () => 'incident',
  EnvioAnulado: () => 'cancelled'
};

/** Reglas por prefijo (eventos con sufijo variable). */
const EVENT_PREFIX_RULES: [prefix: string, rule: Rule][] = [['ExpedicionHojaDeRuta', toInTransit]];

/** En ciclo de devolución, "en movimiento o esperando" significa que la devolución sigue en curso. */
const RETURN_CYCLE_OVERRIDDEN: ReadonlySet<ShipmentStatus> = new Set([
  'in_transit',
  'out_for_delivery',
  'ready_for_pickup',
  'delivery_failed',
  'delivered'
]);

/**
 * Estado de envío que implica un evento, o `null` si solo va al timeline.
 * Un evento de ciclo de devolución sin regla propia implica `returning`.
 */
export function mapEvent(e: MapInput, serviceType: ServiceType): ShipmentStatus | null {
  const ctx = {
    cycle: (e.cycle ?? '').trim().toLowerCase(),
    reason: (e.reason ?? '').trim().toLowerCase()
  };
  const rule =
    EVENT_RULES[e.event] ?? EVENT_PREFIX_RULES.find(([prefix]) => e.event.startsWith(prefix))?.[1];
  const returnCycle = isReturnCycle(ctx.cycle);
  if (rule) {
    const status = rule(ctx, serviceType);
    return returnCycle && RETURN_CYCLE_OVERRIDDEN.has(status) ? 'returning' : status;
  }
  return returnCycle ? 'returning' : null;
}

export function deriveShipmentStatus(
  events: Pick<ShipmentEventInput, 'event' | 'cycle' | 'reason' | 'occurredAt'>[],
  serviceType: ServiceType,
  fallback: ShipmentStatus
): ShipmentStatus {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let status = fallback;
  for (const e of sorted) {
    if (STICKY_STATUSES.has(status)) break;
    const mapped = mapEvent(e, serviceType);
    if (mapped) status = mapped;
  }
  return status;
}

const ORDER_TARGETS: Partial<Record<ShipmentStatus, 'ready_to_ship' | 'shipped' | 'delivered'>> = {
  created: 'ready_to_ship',
  in_transit: 'shipped',
  out_for_delivery: 'shipped',
  ready_for_pickup: 'shipped',
  delivery_failed: 'shipped',
  returning: 'shipped',
  incident: 'shipped',
  delivered: 'delivered'
};

export function orderTargetFor(
  status: ShipmentStatus
): 'ready_to_ship' | 'shipped' | 'delivered' | null {
  return ORDER_TARGETS[status] ?? null;
}
