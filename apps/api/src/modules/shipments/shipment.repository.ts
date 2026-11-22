import type { PoolClient } from 'pg';
import { pool, query } from '../../infrastructure/database/client.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import type { BranchSnapshot } from '../../infrastructure/external/andreani/branches.js';
import type { ShipmentEventInput } from './event-mapping.js';
import {
  BLOCKING_SHIPMENT_STATUSES,
  type PackageLine,
  type ServiceType,
  type Shipment,
  type ShipmentChannel,
  type ShipmentEventRow,
  type ShipmentPackage
} from './shipment.types.js';

type Queryable = Pick<typeof pool, 'query'>;

export type EventSource = 'pull' | 'push' | 'mock';

const run = (client?: PoolClient): Queryable => client ?? pool;

/** Columnas actualizables vía `updateShipment`; las JSONB se serializan explícitamente. */
const UPDATABLE_COLUMNS: ReadonlySet<string> = new Set([
  'contract',
  'channel',
  'status',
  'tracking_number',
  'group_number',
  'andreani_state',
  'destination_branch',
  'localidad',
  'packages',
  'request_payload',
  'raw_response',
  'quoted_price',
  'label_url',
  'last_event',
  'last_event_at',
  'estimated_delivery_at',
  'delivered_at',
  'cancelled_at',
  'error_message',
  'next_poll_at',
  'poll_failures'
]);
const JSONB_COLUMNS: ReadonlySet<string> = new Set([
  'destination_branch',
  'packages',
  'request_payload',
  'raw_response'
]);

export interface InsertRequestingInput {
  orderId: string;
  serviceType: ServiceType;
  contract: string;
  channel: ShipmentChannel;
  packages: ShipmentPackage[];
  destinationBranch: BranchSnapshot | null;
  localidad: string | null;
  quotedPrice: number | null;
  createdBy: string | null;
}

export async function insertRequesting(
  input: InsertRequestingInput,
  client: PoolClient
): Promise<Shipment> {
  try {
    const result = await client.query<Shipment>(
      `INSERT INTO shipments (order_id, service_type, contract, channel, status, packages,
                              destination_branch, localidad, quoted_price, created_by)
       VALUES ($1, $2, $3, $4, 'requesting', $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.orderId,
        input.serviceType,
        input.contract,
        input.channel,
        JSON.stringify(input.packages),
        input.destinationBranch ? JSON.stringify(input.destinationBranch) : null,
        input.localidad,
        input.quotedPrice,
        input.createdBy
      ]
    );
    return result.rows[0];
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505' && e.constraint === 'idx_shipments_one_active_per_order') {
      throw new AppError(
        'SHIPMENT_ALREADY_EXISTS',
        'El pedido ya tiene un envío activo con Andreani',
        409
      );
    }
    throw err;
  }
}

/** Registro de un intento fallido (contract/channel quedan NULL: el esquema lo permite). */
export async function insertError(input: {
  orderId: string;
  serviceType: ServiceType;
  message: string;
  createdBy: string | null;
}): Promise<Shipment> {
  const result = await query<Shipment>(
    `INSERT INTO shipments (order_id, service_type, status, error_message, created_by)
     VALUES ($1, $2, 'error', $3, $4)
     RETURNING *`,
    [input.orderId, input.serviceType, input.message, input.createdBy]
  );
  return result.rows[0];
}

export async function updateShipment(
  id: string,
  patch: Partial<Shipment>,
  client?: PoolClient
): Promise<Shipment> {
  const entries = Object.entries(patch).filter(
    ([key, value]) => UPDATABLE_COLUMNS.has(key) && value !== undefined
  );
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`);
  const values = entries.map(([key, value]) =>
    JSONB_COLUMNS.has(key) && value !== null ? JSON.stringify(value) : value
  );
  const result = await run(client).query<Shipment>(
    `UPDATE shipments SET ${[...sets, 'updated_at = NOW()'].join(', ')}
     WHERE id = $1
     RETURNING *`,
    [id, ...values]
  );
  if (!result.rows[0]) {
    throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
  }
  return result.rows[0];
}

export async function findById(
  id: string,
  client?: PoolClient,
  forUpdate = false
): Promise<Shipment | null> {
  const result = await run(client).query<Shipment>(
    `SELECT * FROM shipments WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findBlockingByOrderId(orderId: string): Promise<Shipment | null> {
  const result = await query<Shipment>(
    `SELECT * FROM shipments
     WHERE order_id = $1 AND status = ANY($2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId, BLOCKING_SHIPMENT_STATUSES]
  );
  return result.rows[0] ?? null;
}

export async function countByOrderId(orderId: string): Promise<number> {
  const result = await query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM shipments WHERE order_id = $1',
    [orderId]
  );
  return result.rows[0].n;
}

export async function findPackageLinesForOrder(orderId: string): Promise<PackageLine[]> {
  const result = await query<PackageLine>(
    `SELECT oi.product_id AS "productId",
            oi.product_name AS "productName",
            oi.real_quantity AS "realQuantity",
            p.weight AS "weightKg",
            p.width AS "widthCm",
            p.length AS "lengthCm",
            p.height AS "heightCm"
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at, oi.id`,
    [orderId]
  );
  return result.rows;
}

/** Tipos de cada columna del VALUES de insertEventsTx (los parámetros llegan sin tipo). */
const EVENT_COLUMN_TYPES = [
  'uuid',
  'timestamptz',
  'text',
  'text',
  'text',
  'text',
  'text',
  'text',
  'text',
  'text',
  'jsonb'
] as const;

/**
 * Inserta todos los eventos en una sola sentencia. Devuelve solo los nuevos: los duplicados
 * (índice de expresión idx_shipment_events_dedupe) se descartan con ON CONFLICT DO NOTHING.
 */
export async function insertEventsTx(
  client: PoolClient,
  shipmentId: string,
  events: ShipmentEventInput[],
  source: EventSource
): Promise<ShipmentEventRow[]> {
  if (events.length === 0) return [];
  const COLS = EVENT_COLUMN_TYPES.length;
  const placeholders = events.map((_, i) => {
    const b = i * COLS;
    return `(${EVENT_COLUMN_TYPES.map((t, j) => `$${b + j + 1}::${t}`).join(', ')})`;
  });
  const values = events.flatMap((e) => [
    shipmentId,
    e.occurredAt,
    e.cycle,
    e.event,
    e.reason,
    e.subReason,
    e.statusLabel,
    e.branchName,
    e.branchId,
    e.comment,
    e.raw === undefined || e.raw === null ? null : JSON.stringify(e.raw)
  ]);
  const result = await client.query<ShipmentEventRow>(
    `INSERT INTO shipment_events (shipment_id, occurred_at, cycle, event, reason, sub_reason,
                                  status_label, branch_name, branch_id, comment, raw, source)
     SELECT v.shipment_id, v.occurred_at, v.cycle, v.event, v.reason, v.sub_reason,
            v.status_label, v.branch_name, v.branch_id, v.comment, v.raw, $${events.length * COLS + 1}::text
     FROM (VALUES ${placeholders.join(', ')})
       AS v(shipment_id, occurred_at, cycle, event, reason, sub_reason, status_label,
            branch_name, branch_id, comment, raw)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [...values, source]
  );
  return result.rows;
}

export async function findEvents(
  shipmentId: string,
  client?: PoolClient
): Promise<ShipmentEventRow[]> {
  const result = await run(client).query<ShipmentEventRow>(
    `SELECT * FROM shipment_events
     WHERE shipment_id = $1
     ORDER BY occurred_at, created_at, id`,
    [shipmentId]
  );
  return result.rows;
}

/**
 * Reclama envíos con polling vencido y los "alquila" `leaseSeconds` (next_poll_at al futuro).
 * FOR UPDATE SKIP LOCKED permite varias instancias a la vez.
 */
export async function claimDueForPolling(limit: number, leaseSeconds: number): Promise<Shipment[]> {
  const result = await query<Shipment>(
    `UPDATE shipments s
     SET next_poll_at = NOW() + make_interval(secs => $2)
     WHERE s.id IN (
       SELECT id FROM shipments
       WHERE next_poll_at IS NOT NULL AND next_poll_at <= NOW()
         AND status NOT IN ('delivered', 'returned', 'cancelled', 'rejected', 'error', 'expired')
       ORDER BY next_poll_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING s.*`,
    [limit, leaseSeconds]
  );
  return result.rows;
}

export async function findByTrackingNumber(n: string): Promise<Shipment | null> {
  const result = await query<Shipment>(
    'SELECT * FROM shipments WHERE tracking_number = $1 ORDER BY created_at DESC LIMIT 1',
    [n]
  );
  return result.rows[0] ?? null;
}
