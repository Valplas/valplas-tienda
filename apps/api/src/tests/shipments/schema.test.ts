import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser, createRawOrder } from '../helpers.js';

async function insertShipment(orderId: string, status: string): Promise<string> {
  const r = await query<{ id: string }>(
    "INSERT INTO shipments (order_id, service_type, status) VALUES ($1, 'home_delivery', $2) RETURNING id",
    [orderId, status]
  );
  return r.rows[0].id;
}

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('shipments schema (053)', () => {
  it('orders has shipping columns', async () => {
    const r = await query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = 'orders'
         AND column_name IN ('shipping_method','pickup_branch','recipient_document','shipped_at')`
    );
    const names = r.rows.map((x) => x.column_name).sort();
    expect(names).toEqual(['pickup_branch', 'recipient_document', 'shipped_at', 'shipping_method']);
    const sm = r.rows.find((x) => x.column_name === 'shipping_method');
    expect(sm?.column_default).toBe("'home_delivery'::character varying");
  });

  it('andreani carrier exists and is external', async () => {
    const r = await query<{ is_external: boolean }>(
      "SELECT is_external FROM shipping_carriers WHERE code = 'andreani'"
    );
    expect(r.rows[0]?.is_external).toBe(true);
  });

  it('allows only one active shipment per order', async () => {
    const user = await createTestUser();
    const orderId = await createRawOrder(user.id);
    await insertShipment(orderId, 'created');
    expect(await pgCode(insertShipment(orderId, 'pending'))).toBe('23505');
    await expect(insertShipment(orderId, 'cancelled')).resolves.toBeTruthy();
  });

  it('dedupes events by (shipment, event, occurred_at, reason)', async () => {
    const user = await createTestUser();
    const orderId = await createRawOrder(user.id);
    const shipmentId = await insertShipment(orderId, 'created');
    const ins = (reason: string | null) =>
      query(
        `INSERT INTO shipment_events (shipment_id, occurred_at, event, reason, source)
         VALUES ($1, '2026-11-21T10:00:00Z', 'Envio_Entregado', $2, 'pull')
         ON CONFLICT DO NOTHING RETURNING id`,
        [shipmentId, reason]
      );
    expect((await ins('r1')).rows).toHaveLength(1);
    expect((await ins('r1')).rows).toHaveLength(0);
    expect((await ins(null)).rows).toHaveLength(1);
    expect((await ins(null)).rows).toHaveLength(0);
  });

  it('rejects unknown shipment status', async () => {
    const user = await createTestUser();
    const orderId = await createRawOrder(user.id);
    expect(await pgCode(insertShipment(orderId, 'bogus'))).toBe('23514');
  });

  it('deleting the order cascades', async () => {
    const user = await createTestUser();
    const orderId = await createRawOrder(user.id);
    const shipmentId = await insertShipment(orderId, 'created');
    await query(
      `INSERT INTO shipment_events (shipment_id, occurred_at, event, source)
       VALUES ($1, NOW(), 'x', 'mock')`,
      [shipmentId]
    );
    await query('DELETE FROM orders WHERE id = $1', [orderId]);
    const s = await query('SELECT 1 FROM shipments WHERE order_id = $1', [orderId]);
    const e = await query('SELECT 1 FROM shipment_events WHERE shipment_id = $1', [shipmentId]);
    expect(s.rows).toHaveLength(0);
    expect(e.rows).toHaveLength(0);
  });
});
