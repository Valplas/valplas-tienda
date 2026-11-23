// apps/api/src/tests/shipments/andreani-e2e.test.ts
//
// E2E en modo mock: dominio real + DB real + cliente mock en memoria (reloj inyectado).
// Reemplaza la verificación manual de PR-A. No se consume stock real (trigger salteado).

import { describe, it, expect, vi, beforeAll } from 'vitest';

const mockState = vi.hoisted(() => ({ client: null as unknown, clock: 0 }));

vi.mock('../../infrastructure/external/andreani/index.js', () => ({
  getAndreaniClient: () => mockState.client,
  isAndreaniEnabled: () => true,
  resetAndreaniClientForTests: vi.fn()
}));

vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: () => ({
    mode: 'mock',
    baseUrl: '',
    username: '',
    password: '',
    clientCode: '',
    contracts: { home: 'C-HOME', branch: 'C-BRANCH', b2b: 'C-B2B' },
    originBranchId: '15',
    sender: {
      name: 'Valplas',
      email: 'envios@valplas.net',
      phone: '1144445555',
      docType: 'CUIT',
      docNumber: '30111111118'
    },
    defaults: { itemWeightKg: 1, itemVolumeCm3: 1000 },
    autoCreate: false,
    pollCron: '',
    trackingUrlTemplate: 'https://example.test/t/{tracking}',
    push: { username: '', password: '' },
    mockStepSeconds: 10
  })
}));

import { query, transaction } from '../../infrastructure/database/client.js';
import { createMockAndreaniClient } from '../../infrastructure/external/andreani/mock-client.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';
import * as domain from '../../modules/shipments/shipment.domain.js';
import * as orderDomain from '../../modules/orders/order.domain.js';

const STEP_S = 10;

interface OrderOpts {
  status?: string;
  admin?: boolean;
  address?: boolean;
  method?: 'home_delivery' | 'branch_pickup';
}

async function createOrder(opts: OrderOpts = {}) {
  const user = await createTestUser();
  const product = (
    await query<{ id: string; name: string; sku: string }>(
      `SELECT id, name, sku FROM products
       WHERE is_active = true AND deleted_at IS NULL ORDER BY created_at LIMIT 1`
    )
  ).rows[0];
  const address = opts.address ?? true;
  const r = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method, shipping_method,
                         admin_notes)
     VALUES ($1, $2, $3, 1000, 0, 1000, $4, $5, $6, 'Buenos Aires', $7, 'cash', $8, 'nota interna')
     RETURNING id`,
    [
      user.id,
      `${opts.admin ? 'ADM' : 'VLP'}-${uniqueSuffix()}`,
      opts.status ?? 'processing',
      address ? 'Av. Vitest' : '',
      address ? '123' : '',
      address ? 'Buenos Aires' : '',
      address ? '1043' : '',
      opts.method ?? 'home_delivery'
    ]
  );
  await transaction(async (c) => {
    await c.query("SELECT set_config('app.skip_stock_trigger', 'true', true)");
    await c.query(
      `INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity,
                                real_quantity, bundle_size_snapshot, unit_price, subtotal)
       VALUES ($1, $2, $3, $4, 2, 2, 1, 500, 1000)`,
      [r.rows[0].id, product.id, product.name, product.sku]
    );
  });
  return { user, orderId: r.rows[0].id };
}

async function orderRow(id: string) {
  return (await query<Record<string, any>>('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
}

const advance = (steps: number) => {
  mockState.clock += steps * STEP_S * 1000;
};

beforeAll(() => {
  mockState.clock = Date.now() - 24 * 3600 * 1000;
  mockState.client = createMockAndreaniClient({
    stepSeconds: STEP_S,
    now: () => mockState.clock
  });
});

describe('Andreani mock-mode E2E', () => {
  it('home delivery: preview, create, label, tracking to delivered, views, history', async () => {
    const { user, orderId } = await createOrder();

    const preview = await domain.previewForOrder(orderId);
    expect(preview.canCreate).toBe(true);
    expect(preview.packages.length).toBeGreaterThan(0);

    const created = await domain.createForOrder(orderId, { serviceType: 'home_delivery' }, null);
    expect(['pending', 'created']).toContain(created.status);
    expect(created.tracking_number).toBeTruthy();
    expect((await orderRow(orderId)).status).toBe('ready_to_ship');

    const label = await domain.getLabel(created.id);
    expect(label.data.subarray(0, 4).toString('latin1')).toBe('%PDF');

    // Recorre todos los pasos del mock refrescando dos veces por paso
    let s = created;
    for (let step = 0; step < 6; step++) {
      s = await domain.refreshShipment(created.id);
      s = await domain.refreshShipment(created.id);
      advance(1);
    }
    for (let i = 0; i < 3; i++) s = await domain.refreshShipment(created.id);

    const events = (
      await query<{ event: string; occurred_at: Date }>(
        'SELECT event, occurred_at FROM shipment_events WHERE shipment_id = $1',
        [created.id]
      )
    ).rows;
    expect(events.length).toBe(6);
    expect(new Set(events.map((e) => e.event)).size).toBe(6);
    expect(s.status).toBe('delivered');

    const order = await orderRow(orderId);
    expect(order.status).toBe('delivered');
    expect(order.tracking_number).toBe(created.tracking_number);
    expect(order.shipped_at).not.toBeNull();
    expect(order.delivered_at).not.toBeNull();

    const hist = (
      await query<{ to_status: string }>(
        'SELECT status AS to_status FROM order_status_history WHERE order_id = $1 ORDER BY created_at',
        [orderId]
      )
    ).rows.map((h) => h.to_status);
    const idx = (st: string) => hist.indexOf(st);
    expect(idx('ready_to_ship')).toBeGreaterThanOrEqual(0);
    expect(idx('shipped')).toBeGreaterThan(idx('ready_to_ship'));
    expect(idx('delivered')).toBeGreaterThan(idx('shipped'));

    // Vista cliente
    const customer = (await orderDomain.getOrderById(orderId, user.id, false)) as any;
    expect(customer.admin_notes).toBeUndefined();
    const cs = customer.shipments[0];
    expect(cs.events.length).toBe(6);
    expect(cs.tracking_url).toBe(
      `https://example.test/t/${encodeURIComponent(created.tracking_number!)}`
    );
    for (const k of [
      'admin_notes',
      'request_payload',
      'raw_response',
      'error_message',
      'contract'
    ]) {
      expect(cs).not.toHaveProperty(k);
    }

    // Vista admin
    const admin = (await orderDomain.getOrderById(orderId, user.id, true)) as any;
    const as = admin.shipments[0];
    expect(admin.admin_notes).toBe('nota interna');
    expect(as).toHaveProperty('error_message');
    expect(as.contract).toBe('C-HOME');
    expect(as.events.length).toBe(6);
    expect(as).not.toHaveProperty('request_payload');
    expect(as).not.toHaveProperty('raw_response');
  });

  it('cancel before admission returns order to processing', async () => {
    const { orderId } = await createOrder();
    const created = await domain.createForOrder(orderId, { serviceType: 'home_delivery' }, null);
    const cancelling = await domain.cancelShipment(created.id);
    expect(cancelling.status).toBe('cancelling');
    const after = await domain.refreshShipment(created.id);
    expect(after.status).toBe('cancelled');
    expect((await orderRow(orderId)).status).toBe('processing');
  });

  it('ADM order without address: home blocked, branch pickup works', async () => {
    const { orderId } = await createOrder({ admin: true, address: false });
    const home = await domain.previewForOrder(orderId, { serviceType: 'home_delivery' });
    expect(home.canCreate).toBe(false);

    const branch = await domain.previewForOrder(orderId, {
      serviceType: 'branch_pickup',
      branchId: '10015'
    });
    expect(branch.canCreate).toBe(true);
    const s = await domain.createForOrder(
      orderId,
      { serviceType: 'branch_pickup', branchId: '10015' },
      null
    );
    expect(['pending', 'created']).toContain(s.status);
    expect(s.contract).toBe('C-BRANCH');
    expect((await orderRow(orderId)).status).toBe('ready_to_ship');
  });

  it('customer cannot change order status (403)', async () => {
    const { user, orderId } = await createOrder();
    await expect(
      orderDomain.updateOrderStatus(orderId, { status: 'cancelled' } as any, user.id, false)
    ).rejects.toMatchObject({ code: 'ORDER_FORBIDDEN', statusCode: 403 });
  });
});
