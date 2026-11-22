import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';
import { ingestEvents, nextPollDelayMinutes } from '../../modules/shipments/shipment-ingest.js';
import type { ShipmentEventInput } from '../../modules/shipments/event-mapping.js';
import * as orderDomain from '../../modules/orders/order.domain.js';

const TRACKING = '360000000000001';

async function createOrder(userId: string, status: string): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method)
     VALUES ($1, $2, $3, 1000, 0, 1000, 'Av. Vitest 123', 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`, status]
  );
  return r.rows[0].id;
}

async function insertShipment(orderId: string, status = 'created'): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO shipments (order_id, service_type, status, tracking_number)
     VALUES ($1, 'home_delivery', $2, $3) RETURNING id`,
    [orderId, status, TRACKING]
  );
  return r.rows[0].id;
}

function ev(
  event: string,
  minute: number,
  over: Partial<ShipmentEventInput> = {}
): ShipmentEventInput {
  return {
    occurredAt: new Date(Date.UTC(2026, 10, 20, 12, minute, 0)),
    cycle: null,
    event,
    reason: null,
    subReason: null,
    statusLabel: event,
    branchName: null,
    branchId: null,
    comment: null,
    raw: { event },
    ...over
  };
}

async function setup(orderStatus = 'payment_confirmed', shipmentStatus = 'created') {
  const user = await createTestUser();
  const orderId = await createOrder(user.id, orderStatus);
  const shipmentId = await insertShipment(orderId, shipmentStatus);
  return { user, orderId, shipmentId };
}

async function getOrder(id: string) {
  const r = await query<{
    status: string;
    shipped_at: Date | null;
    delivered_at: Date | null;
    tracking_number: string | null;
  }>('SELECT status, shipped_at, delivered_at, tracking_number FROM orders WHERE id = $1', [id]);
  return r.rows[0];
}

async function getShipment(id: string) {
  const r = await query<{
    status: string;
    delivered_at: Date | null;
    next_poll_at: Date | null;
    last_event: string | null;
    andreani_state: string | null;
  }>(
    'SELECT status, delivered_at, next_poll_at, last_event, andreani_state FROM shipments WHERE id = $1',
    [id]
  );
  return r.rows[0];
}

async function historyStatuses(orderId: string): Promise<string[]> {
  const r = await query<{ status: string }>(
    'SELECT status FROM order_status_history WHERE order_id = $1',
    [orderId]
  );
  return r.rows.map((x) => x.status);
}

async function eventCount(shipmentId: string): Promise<number> {
  const r = await query<{ n: string }>(
    'SELECT COUNT(*)::int AS n FROM shipment_events WHERE shipment_id = $1',
    [shipmentId]
  );
  return Number(r.rows[0].n);
}

describe('shipment ingestion', () => {
  it('inserts events, derives status and advances order', async () => {
    const { orderId, shipmentId } = await setup();
    const res = await ingestEvents(
      shipmentId,
      [ev('OrdenDeEnvioCreada', 0), ev('Admision', 5)],
      'pull'
    );
    expect(res).toEqual({ inserted: 2, status: 'in_transit' });
    const order = await getOrder(orderId);
    expect(order.status).toBe('shipped');
    expect(order.shipped_at).not.toBeNull();
    expect(order.tracking_number).toBe(TRACKING);
    const hist = await historyStatuses(orderId);
    expect(hist).toEqual(expect.arrayContaining(['processing', 'ready_to_ship', 'shipped']));
    const s = await getShipment(shipmentId);
    expect(s.last_event).toBe('Admision');
    expect(s.andreani_state).toBe('Admision');
  });

  it('dedupes re-ingestion', async () => {
    const { orderId, shipmentId } = await setup();
    const events = [ev('OrdenDeEnvioCreada', 0), ev('Admision', 5)];
    await ingestEvents(shipmentId, events, 'pull');
    const histBefore = (await historyStatuses(orderId)).length;
    const res = await ingestEvents(shipmentId, events, 'push');
    expect(res.inserted).toBe(0);
    expect(await eventCount(shipmentId)).toBe(2);
    expect((await historyStatuses(orderId)).length).toBe(histBefore);
  });

  it('delivered event sets delivered_at on shipment and order', async () => {
    const { orderId, shipmentId } = await setup();
    const res = await ingestEvents(
      shipmentId,
      [ev('Admision', 0), ev('Distribucion', 5), ev('EnvioEntregado', 10)],
      'pull'
    );
    expect(res.status).toBe('delivered');
    expect((await getShipment(shipmentId)).delivered_at).not.toBeNull();
    const order = await getOrder(orderId);
    expect(order.status).toBe('delivered');
    expect(order.delivered_at).not.toBeNull();
  });

  it('return cycle never marks order delivered', async () => {
    const { orderId, shipmentId } = await setup();
    const res = await ingestEvents(
      shipmentId,
      [
        ev('Admision', 0),
        ev('EnvioNoEntregado', 5),
        ev('EnvioEntregado', 10, { cycle: 'Devolucion' })
      ],
      'pull'
    );
    expect(res.status).toBe('returned');
    expect((await getOrder(orderId)).status).toBe('shipped');
  });

  it('ingest never moves a cancelled order', async () => {
    const { orderId, shipmentId } = await setup();
    await query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
    const res = await ingestEvents(shipmentId, [ev('Admision', 0)], 'pull');
    expect(res.status).toBe('in_transit');
    expect((await getOrder(orderId)).status).toBe('cancelled');
  });

  it("does not touch cancelled/error/expired shipments' status", async () => {
    const { shipmentId } = await setup('payment_confirmed', 'cancelled');
    const res = await ingestEvents(shipmentId, [ev('Admision', 0)], 'pull');
    expect(res).toEqual({ inserted: 1, status: 'cancelled' });
    expect(await eventCount(shipmentId)).toBe(1);
    expect((await getShipment(shipmentId)).status).toBe('cancelled');
  });

  it('sets next_poll_at from nextPollDelayMinutes', async () => {
    const a = await setup();
    await ingestEvents(a.shipmentId, [ev('Admision', 0)], 'pull');
    const poll = (await getShipment(a.shipmentId)).next_poll_at;
    expect(poll).not.toBeNull();
    const diffMin = (poll!.getTime() - Date.now()) / 60000;
    expect(diffMin).toBeGreaterThan(58);
    expect(diffMin).toBeLessThan(62);

    const b = await setup();
    await ingestEvents(b.shipmentId, [ev('EnvioEntregado', 0)], 'pull');
    expect((await getShipment(b.shipmentId)).next_poll_at).toBeNull();
  });

  it.each([
    ['in_transit', 'Admision', 60],
    ['ready_for_pickup', 'ComienzoCustodiaEnSucursal', 360]
  ])('reschedules next_poll_at when no new events (%s)', async (status, event, minutes) => {
    const { shipmentId } = await setup('shipped', status);
    await ingestEvents(shipmentId, [ev(event as string, 0)], 'pull');
    await query("UPDATE shipments SET next_poll_at = NOW() + interval '10 minutes' WHERE id = $1", [
      shipmentId
    ]);
    const res = await ingestEvents(shipmentId, [ev(event as string, 0)], 'pull');
    expect(res.inserted).toBe(0);
    const poll = (await getShipment(shipmentId)).next_poll_at;
    const diffMin = (poll!.getTime() - Date.now()) / 60000;
    expect(Math.abs(diffMin - (minutes as number))).toBeLessThan(0.5);
  });

  it('nextPollDelayMinutes table', () => {
    expect(nextPollDelayMinutes('requesting')).toBe(5);
    expect(nextPollDelayMinutes('pending')).toBe(30);
    expect(nextPollDelayMinutes('cancelling')).toBe(15);
    expect(nextPollDelayMinutes('ready_for_pickup')).toBe(360);
    expect(nextPollDelayMinutes('returning')).toBe(60);
    expect(nextPollDelayMinutes('delivered')).toBeNull();
    expect(nextPollDelayMinutes('cancelled')).toBeNull();
  });

  it('assertNoBlockingShipment blocks cancelling with an active shipment', async () => {
    const { user, orderId } = await setup('payment_confirmed', 'in_transit');
    await expect(
      orderDomain.updateOrderStatus(orderId, { status: 'cancelled' }, user.id, true)
    ).rejects.toMatchObject({ code: 'SHIPMENT_ACTIVE', statusCode: 409 });
  });

  it('assertNoBlockingShipment allows cancelling with a returned shipment', async () => {
    const { user, orderId } = await setup('payment_confirmed', 'returned');
    const res = await orderDomain.updateOrderStatus(
      orderId,
      { status: 'cancelled' },
      user.id,
      true
    );
    expect(res.status).toBe('cancelled');
  });
});

describe('ingestion vs lifecycle (cancelling / cancelled / rejected)', () => {
  it('cancelling stays cancelling when the derived status is only created', async () => {
    const { shipmentId } = await setup('ready_to_ship', 'cancelling');
    const res = await ingestEvents(shipmentId, [ev('OrdenDeEnvioCreada', 0)], 'pull');
    expect(res.status).toBe('cancelling');
    expect((await getShipment(shipmentId)).status).toBe('cancelling');
  });

  it('cancelling moves to in_transit when the parcel was admitted', async () => {
    const { shipmentId } = await setup('ready_to_ship', 'cancelling');
    const res = await ingestEvents(shipmentId, [ev('Admision', 0)], 'pull');
    expect(res.status).toBe('in_transit');
    expect((await getShipment(shipmentId)).status).toBe('in_transit');
  });

  it('EnvioAnulado -> cancelled with cancelled_at and order back to processing', async () => {
    const { orderId, shipmentId } = await setup('ready_to_ship', 'cancelling');
    await query('UPDATE orders SET tracking_number = $2 WHERE id = $1', [orderId, TRACKING]);
    const res = await ingestEvents(shipmentId, [ev('EnvioAnulado', 0)], 'push');
    expect(res.status).toBe('cancelled');
    const row = await query<{ cancelled_at: Date | null }>(
      'SELECT cancelled_at FROM shipments WHERE id = $1',
      [shipmentId]
    );
    expect(row.rows[0].cancelled_at).not.toBeNull();
    const order = await getOrder(orderId);
    expect(order.status).toBe('processing');
    expect(order.tracking_number).toBeNull();
  });

  it('EnvioAnulado leaves an order that is not ready_to_ship untouched', async () => {
    const { orderId, shipmentId } = await setup('processing', 'created');
    await ingestEvents(shipmentId, [ev('EnvioAnulado', 0)], 'push');
    expect((await getOrder(orderId)).status).toBe('processing');
    expect(await historyStatuses(orderId)).toEqual([]);
  });

  it('OrdenDeEnvioRechazada -> rejected and order back to processing', async () => {
    const { orderId, shipmentId } = await setup('ready_to_ship', 'pending');
    const res = await ingestEvents(shipmentId, [ev('OrdenDeEnvioRechazada', 0)], 'push');
    expect(res.status).toBe('rejected');
    expect((await getOrder(orderId)).status).toBe('processing');
    const row = await query<{ cancelled_at: Date | null }>(
      'SELECT cancelled_at FROM shipments WHERE id = $1',
      [shipmentId]
    );
    expect(row.rows[0].cancelled_at).toBeNull();
  });
});
