// apps/api/src/tests/orders/order.status-guard.test.ts
//
// Guard de cambios de estado: solo admin, compare-and-swap y avance forward-only.

import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { query, transaction } from '../../infrastructure/database/client.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import { VALID_STATUS_TRANSITIONS } from '../../modules/orders/order.types.js';
import type { OrderStatus } from '../../modules/orders/order.types.js';
import router from '../../modules/orders/order.routes.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';

async function createOrderWithStatus(userId: string, status: OrderStatus): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method)
     VALUES ($1, $2, $3::order_status, 1000, 0, 1000, 'Av. Vitest 123', 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`, status]
  );
  return result.rows[0].id;
}

async function getOrder(id: string) {
  const r = await query<Record<string, unknown>>('SELECT * FROM orders WHERE id = $1', [id]);
  return r.rows[0];
}

async function getHistory(id: string) {
  const r = await query<{ status: string; changed_by: string | null }>(
    `SELECT status, changed_by FROM order_status_history
     WHERE order_id = $1 ORDER BY created_at, status`,
    [id]
  );
  return r.rows;
}

function fakeRes() {
  const out = { status: 0, res: {} as Response };
  out.res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json() {
      return this;
    }
  } as unknown as Response;
  return out;
}

describe('order status guard', () => {
  it('customer cannot change status', async () => {
    const customer = await createTestUser();
    const id = await createOrderWithStatus(customer.id, 'pending_payment');
    await expect(
      orderDomain.updateOrderStatus(id, { status: 'payment_confirmed' }, customer.id, false)
    ).rejects.toMatchObject({ code: 'ORDER_FORBIDDEN', statusCode: 403 });
    expect((await getOrder(id)).status).toBe('pending_payment');
  });

  it('admin transition still works', async () => {
    const customer = await createTestUser();
    const admin = await createTestUser();
    const id = await createOrderWithStatus(customer.id, 'pending_payment');
    await orderDomain.updateOrderStatus(id, { status: 'payment_confirmed' }, admin.id, true);
    expect((await getOrder(id)).paid_at).not.toBeNull();
    expect(await getHistory(id)).toEqual([{ status: 'payment_confirmed', changed_by: admin.id }]);
  });

  it('CAS mismatch returns null', async () => {
    const customer = await createTestUser();
    const id = await createOrderWithStatus(customer.id, 'payment_confirmed');
    const result = await orderRepository.updateOrderStatus(id, { status: 'processing' }, null, {
      expectedStatus: 'pending_payment'
    });
    expect(result).toBeNull();
    expect((await getOrder(id)).status).toBe('payment_confirmed');
    expect(await getHistory(id)).toHaveLength(0);
  });

  it('domain maps CAS miss to 409', async () => {
    const customer = await createTestUser();
    const admin = await createTestUser();
    const id = await createOrderWithStatus(customer.id, 'payment_confirmed');
    const results = await Promise.allSettled([
      orderDomain.updateOrderStatus(id, { status: 'processing' }, admin.id, true),
      orderDomain.updateOrderStatus(id, { status: 'processing' }, admin.id, true)
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'ORDER_STATUS_CONFLICT' });
  });

  it('customer cancel only from pending_payment', async () => {
    const customer = await createTestUser();
    const processing = await createOrderWithStatus(customer.id, 'processing');
    await expect(
      orderDomain.cancelOrder(processing, 'x', customer.id, false)
    ).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });

    const pending = await createOrderWithStatus(customer.id, 'pending_payment');
    await orderDomain.cancelOrder(pending, 'x', customer.id, false);
    const row = await getOrder(pending);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_at).not.toBeNull();
  });

  it('advanceOrderTo walks the path', async () => {
    const customer = await createTestUser();
    const id = await createOrderWithStatus(customer.id, 'payment_confirmed');
    await transaction((client) =>
      orderRepository.advanceOrderTo(client, id, 'shipped', 'x', {
        trackingNumber: '360000000000001'
      })
    );
    const row = await getOrder(id);
    expect(row.status).toBe('shipped');
    expect(row.shipped_at).not.toBeNull();
    expect(row.tracking_number).toBe('360000000000001');
    const history = await getHistory(id);
    expect(history.map((h) => h.status)).toEqual(['processing', 'ready_to_ship', 'shipped']);
    expect(history.every((h) => h.changed_by === null)).toBe(true);
  });

  it('advanceOrderTo is a no-op backwards or off-path', async () => {
    const customer = await createTestUser();
    const delivered = await createOrderWithStatus(customer.id, 'delivered');
    const cancelled = await createOrderWithStatus(customer.id, 'cancelled');
    const r1 = await transaction((c) =>
      orderRepository.advanceOrderTo(c, delivered, 'shipped', 'x')
    );
    const r2 = await transaction((c) =>
      orderRepository.advanceOrderTo(c, cancelled, 'shipped', 'x')
    );
    expect(r1?.status).toBe('delivered');
    expect(r2?.status).toBe('cancelled');
    expect((await getOrder(delivered)).status).toBe('delivered');
    expect((await getOrder(cancelled)).status).toBe('cancelled');
    expect(await getHistory(delivered)).toHaveLength(0);
    expect(await getHistory(cancelled)).toHaveLength(0);
  });

  it('transition ready_to_ship -> processing allowed', () => {
    expect(VALID_STATUS_TRANSITIONS.ready_to_ship).toContain('processing');
  });

  it('route has requireRole', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stack = (router as any).stack as any[];
    const layer = stack.find((l) => l.route?.path === '/:id/status' && l.route.methods.patch);
    expect(layer).toBeDefined();
    expect(layer.route.stack).toHaveLength(3);
    const guard = layer.route.stack[0].handle;
    const out = fakeRes();
    guard({ user: { role: 'customer' } } as unknown as Request, out.res, () => {
      throw new Error('next should not be called');
    });
    expect(out.status).toBe(403);
  });
});
