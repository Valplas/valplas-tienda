import { describe, it, expect, vi } from 'vitest';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import { trackingUrlFor } from '../../modules/shipments/shipment.view.js';

const tpl = vi.hoisted(() => ({ value: 'https://example.test/t/{tracking}' }));

vi.mock('../../infrastructure/external/andreani/config.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../infrastructure/external/andreani/config.js')>();
  return {
    ...actual,
    getAndreaniConfig: () => ({ ...actual.getAndreaniConfig(), trackingUrlTemplate: tpl.value })
  };
});

const TRACKING = '360000000000001';

async function createOrder(userId: string): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method, admin_notes)
     VALUES ($1, $2, 'payment_confirmed', 1000, 0, 1000, 'Av. Vitest 123', 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash', 'nota interna')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`]
  );
  return r.rows[0].id;
}

async function insertShipment(
  orderId: string,
  status: string,
  tracking: string | null,
  ageMin = 0
) {
  const r = await query<{ id: string }>(
    `INSERT INTO shipments (order_id, service_type, status, tracking_number, contract,
                            request_payload, raw_response, error_message, quoted_price, created_at)
     VALUES ($1, 'home_delivery', $2, $3, 'CONTRACT-1', '{"secret":1}', '{"raw":1}', 'boom', 123.5,
             now() - make_interval(mins => $4))
     RETURNING id`,
    [orderId, status, tracking, ageMin]
  );
  return r.rows[0].id;
}

async function insertEvent(shipmentId: string, event: string, minute: number) {
  await query(
    `INSERT INTO shipment_events (shipment_id, occurred_at, event, status_label, source)
     VALUES ($1, $2, $3, $3, 'pull')`,
    [shipmentId, new Date(Date.UTC(2026, 10, 20, 12, minute, 0)), event]
  );
}

async function setup() {
  const user = await createTestUser();
  const orderId = await createOrder(user.id);
  const cancelledId = await insertShipment(orderId, 'cancelled', null, 10);
  const activeId = await insertShipment(orderId, 'in_transit', TRACKING, 0);
  await insertEvent(activeId, 'Pieza en camino', 5);
  await insertEvent(activeId, 'Pieza admitida', 1);
  return { user, orderId, cancelledId, activeId };
}

describe('order shipment view', () => {
  it('admin detail includes shipments with events newest first', async () => {
    const { user, orderId, activeId } = await setup();
    const order = await orderDomain.getOrderById(orderId, user.id, true);
    expect(order.shipments.length).toBe(2);
    expect(order.shipments[0].id).toBe(activeId);
    const events = (order.shipments[0] as { events: { occurred_at: string; event: string }[] })
      .events;
    expect(events.map((e) => e.event)).toEqual(['Pieza en camino', 'Pieza admitida']);
    expect(new Date(events[0].occurred_at).getTime()).toBeGreaterThan(
      new Date(events[1].occurred_at).getTime()
    );
    expect(order.shipments[0]).not.toHaveProperty('request_payload');
    expect(order.shipments[0]).not.toHaveProperty('raw_response');
    expect(order.shipments[0]).toHaveProperty('tracking_url', 'https://example.test/t/' + TRACKING);
    expect(order.shipments[0]).toHaveProperty('contract', 'CONTRACT-1');
    expect(order).toHaveProperty('admin_notes', 'nota interna');
  });

  it('customer view strips internal fields', async () => {
    const { user, orderId } = await setup();
    const order = await orderDomain.getOrderById(orderId, user.id, false);
    expect(order).not.toHaveProperty('admin_notes');
    expect(order.shipments.length).toBe(1);
    for (const s of order.shipments) {
      for (const k of [
        'contract',
        'request_payload',
        'raw_response',
        'error_message',
        'quoted_price',
        'packages'
      ]) {
        expect(s).not.toHaveProperty(k);
      }
      expect(s.status).toBe('in_transit');
    }
  });

  it('tracking_url uses template', () => {
    tpl.value = 'https://example.test/t/{tracking}';
    expect(trackingUrlFor(TRACKING)).toBe('https://example.test/t/360000000000001');
    expect(trackingUrlFor(null)).toBeNull();
    tpl.value = '';
    expect(trackingUrlFor(TRACKING)).toBeNull();
    tpl.value = 'https://example.test/t/{tracking}';
  });

  it('list returns active_shipment', async () => {
    const { user, orderId } = await setup();
    const emptyOrderId = await createOrder(user.id);
    const { orders } = await orderRepository.findOrders({ user_id: user.id, limit: 20 });
    const withShipment = orders.find((o) => o.id === orderId);
    const without = orders.find((o) => o.id === emptyOrderId);
    expect(withShipment?.active_shipment?.status).toBe('in_transit');
    expect(withShipment?.active_shipment?.tracking_number).toBe(TRACKING);
    expect(without?.active_shipment).toBeNull();
  });

  it.each(['requesting', 'error', 'rejected', 'cancelled', 'expired'])(
    'customer list hides active_shipment when it is %s',
    async (status) => {
      const user = await createTestUser();
      const orderId = await createOrder(user.id);
      // 'cancelled'/'error'/... ya están excluidos en SQL; 'requesting' llega al dominio.
      await insertShipment(orderId, status, null);
      const { orders } = await orderDomain.getUserOrders(user.id, { limit: 20 });
      expect(orders.find((o) => o.id === orderId)?.active_shipment ?? null).toBeNull();
    }
  );

  it('customer list still shows a visible active_shipment', async () => {
    const user = await createTestUser();
    const orderId = await createOrder(user.id);
    await insertShipment(orderId, 'pending', TRACKING);
    const { orders } = await orderDomain.getUserOrders(user.id, { limit: 20 });
    expect(orders.find((o) => o.id === orderId)?.active_shipment?.status).toBe('pending');
  });

  it('admin list keeps showing a requesting active_shipment', async () => {
    const user = await createTestUser();
    const orderId = await createOrder(user.id);
    await insertShipment(orderId, 'requesting', null);
    const { orders } = await orderDomain.getAllOrders({ user_id: user.id, limit: 20 });
    expect(orders.find((o) => o.id === orderId)?.active_shipment?.status).toBe('requesting');
  });

  it('customer getUserOrders rows have no admin_notes', async () => {
    const { user } = await setup();
    const { orders } = await orderDomain.getUserOrders(user.id, { limit: 20 });
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) expect(o).not.toHaveProperty('admin_notes');
  });
});
