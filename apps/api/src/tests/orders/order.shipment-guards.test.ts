// apps/api/src/tests/orders/order.shipment-guards.test.ts
//
// Guards entre pedidos y envíos Andreani: cancelación atómica contra el alta, edición admin y
// vuelta manual a "En proceso" bloqueadas mientras hay un envío activo.

import { describe, it, expect } from 'vitest';
import { query, transaction } from '../../infrastructure/database/client.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import type { OrderStatus } from '../../modules/orders/order.types.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';

async function createOrder(userId: string, status: OrderStatus): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method)
     VALUES ($1, $2, $3::order_status, 1000, 0, 1000, 'Av. Vitest 123', 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`, status]
  );
  return r.rows[0].id;
}

async function insertShipment(orderId: string, status: string): Promise<string> {
  const r = await query<{ id: string }>(
    `INSERT INTO shipments (order_id, service_type, status) VALUES ($1, 'home_delivery', $2)
     RETURNING id`,
    [orderId, status]
  );
  return r.rows[0].id;
}

async function orderStatus(id: string): Promise<string> {
  const r = await query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [id]);
  return r.rows[0].status;
}

describe('cancel vs shipment creation', () => {
  it('admin cancelOrder is blocked by an active shipment (SHIPMENT_ACTIVE)', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'processing');
    await insertShipment(orderId, 'requesting');
    await expect(orderDomain.cancelOrder(orderId, 'x', admin.id, true)).rejects.toMatchObject({
      code: 'SHIPMENT_ACTIVE',
      statusCode: 409
    });
    expect(await orderStatus(orderId)).toBe('processing');
  });

  it('cancel waits for a concurrent shipment creation that holds the order lock', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'processing');
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => {
      locked = r;
    });
    // Simula la tx1 del alta: lock del pedido + fila 'requesting', commit recién después.
    const creating = transaction(async (client) => {
      await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      locked();
      await client.query(
        "INSERT INTO shipments (order_id, service_type, status) VALUES ($1, 'home_delivery', 'requesting')",
        [orderId]
      );
      await gate;
    });
    await lockedP;
    const cancelling = orderDomain.updateOrderStatus(
      orderId,
      { status: 'cancelled' },
      admin.id,
      true
    );
    const settled = cancelling.then(
      () => 'ok',
      (e: { code?: string }) => e.code
    );
    await new Promise((r) => setTimeout(r, 400));
    release();
    await creating;
    expect(await settled).toBe('SHIPMENT_ACTIVE');
    expect(await orderStatus(orderId)).toBe('processing');
  });

  it('cancel still works without an active shipment', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'processing');
    await insertShipment(orderId, 'cancelled');
    const res = await orderDomain.cancelOrder(orderId, 'x', admin.id, true);
    expect(res.status).toBe('cancelled');
  });
});

describe('admin edits and manual revert with an active shipment', () => {
  it('updateAdminOrder -> 409 SHIPMENT_ACTIVE', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'processing');
    await insertShipment(orderId, 'requesting');
    await expect(
      orderDomain.updateAdminOrder(orderId, { items: [] }, admin.id)
    ).rejects.toMatchObject({ code: 'SHIPMENT_ACTIVE', statusCode: 409 });
  });

  it('manual ready_to_ship -> processing is blocked while a shipment is active', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'ready_to_ship');
    await insertShipment(orderId, 'pending');
    await expect(
      orderDomain.updateOrderStatus(orderId, { status: 'processing' }, admin.id, true)
    ).rejects.toMatchObject({ code: 'SHIPMENT_ACTIVE', statusCode: 409 });
    expect(await orderStatus(orderId)).toBe('ready_to_ship');
  });

  it('manual ready_to_ship -> processing works without an active shipment', async () => {
    const admin = await createTestUser();
    const orderId = await createOrder(admin.id, 'ready_to_ship');
    await insertShipment(orderId, 'cancelled');
    const res = await orderDomain.updateOrderStatus(
      orderId,
      { status: 'processing' },
      admin.id,
      true
    );
    expect(res.status).toBe('processing');
  });
});
