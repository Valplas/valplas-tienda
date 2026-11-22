// apps/api/src/tests/shipments/shipment.domain.test.ts
//
// Dominio de envíos Andreani: preview, alta (pre-envío), cancelación, refresh y etiqueta.
// DB real; el cliente de Andreani y su config se reemplazan por fakes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const client = vi.hoisted(() => ({
  quote: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  getLabel: vi.fn(),
  getTraces: vi.fn(),
  cancelShipment: vi.fn(),
  getCancellation: vi.fn(),
  listBranches: vi.fn(),
  listLocalities: vi.fn()
}));
const state = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../infrastructure/external/andreani/index.js', () => ({
  getAndreaniClient: () => client,
  isAndreaniEnabled: () => state.enabled,
  resetAndreaniClientForTests: vi.fn()
}));

vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: () => ({
    mode: state.enabled ? 'mock' : 'disabled',
    baseUrl: '',
    username: '',
    password: '',
    clientCode: '',
    contracts: { home: 'C-HOME', branch: 'C-BRANCH', b2b: 'C-B2B' },
    originBranchId: '1',
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
    trackingUrlTemplate: '',
    push: { username: '', password: '' },
    mockStepSeconds: 0
  })
}));

vi.mock('../../modules/shipments/shipment-ingest.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../modules/shipments/shipment-ingest.js')>();
  return { ...actual, ingestEvents: vi.fn(actual.ingestEvents) };
});

import { query, transaction } from '../../infrastructure/database/client.js';
import { AndreaniError } from '../../infrastructure/external/andreani/errors.js';
import { clearBranchCache } from '../../infrastructure/external/andreani/branches.js';
import { clearLocalityCache } from '../../infrastructure/external/andreani/localities.js';
import type {
  AndreaniOrderResponse,
  AndreaniCreateOrderResult
} from '../../infrastructure/external/andreani/types.js';
import { createTestUser, createTestShipping, uniqueSuffix } from '../helpers.js';
import { ingestEvents } from '../../modules/shipments/shipment-ingest.js';
import * as domain from '../../modules/shipments/shipment.domain.js';

const TRACKING = '360000101651699';
const GROUP = 'API0000000428931';
const LABEL_URL = `https://apis.andreani.com/v2/ordenes-de-envio/${GROUP}/etiquetas`;

function body(
  estado = 'Pendiente',
  over: Partial<AndreaniOrderResponse> = {}
): AndreaniOrderResponse {
  return {
    estado,
    tipo: 'B2C',
    fechaCreacion: '2026-11-21T10:00:00',
    bultos: [{ numeroDeBulto: '1', numeroDeEnvio: TRACKING, totalizador: '1', linking: [] }],
    agrupadorDeBultos: GROUP,
    etiquetasPorAgrupador: LABEL_URL,
    ...over
  };
}

const accepted = (estado = 'Pendiente'): AndreaniCreateOrderResult => ({
  httpStatus: 202,
  body: body(estado)
});

const BRANCH = {
  id: '99',
  numero: '99',
  descripcion: 'SUCURSAL TEST',
  direccion: {
    calle: 'Av Test',
    numero: '10',
    codigoPostal: '1043',
    localidad: 'CABA',
    provincia: 'BA'
  },
  codigosPostalesAtendidos: ['1043']
};

interface OrderOpts {
  status?: string;
  admin?: boolean;
  address?: boolean;
  method?: 'home_delivery' | 'branch_pickup';
  withCarrier?: boolean;
}

let productId: string;
let originalWeight: unknown;

async function createOrder(opts: OrderOpts = {}) {
  const user = await createTestUser();
  const carrier = opts.withCarrier ? await createTestShipping(1500) : null;
  // Producto fijo del catálogo: el trigger de stock se saltea al insertar los ítems (abajo),
  // así los tests nunca consumen stock real.
  const product = (
    await query<{ id: string; name: string; sku: string }>(
      `SELECT id, name, sku FROM products
       WHERE is_active = true AND deleted_at IS NULL ORDER BY created_at LIMIT 1`
    )
  ).rows[0];
  productId = product.id;
  const address = opts.address ?? true;
  const r = await query<{ id: string; order_number: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method,
                         shipping_method, shipping_carrier_id)
     VALUES ($1, $2, $3, 1000, $4::numeric, 1000 + $4::numeric, $5, $6, $7, 'Buenos Aires', $8, 'cash', $9, $10)
     RETURNING id, order_number`,
    [
      user.id,
      `${opts.admin ? 'ADM' : 'VLP'}-${uniqueSuffix()}`,
      opts.status ?? 'processing',
      carrier ? carrier.price : 0,
      address ? 'Av. Vitest' : '',
      address ? '123' : '',
      address ? 'Buenos Aires' : '',
      address ? '1043' : '',
      opts.method ?? 'home_delivery',
      carrier?.carrierId ?? null
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
  return { user, orderId: r.rows[0].id, orderNumber: r.rows[0].order_number };
}

async function getOrderRow(id: string) {
  const r = await query<Record<string, any>>('SELECT * FROM orders WHERE id = $1', [id]);
  return r.rows[0];
}

const homeInput = { serviceType: 'home_delivery' as const };

beforeEach(async () => {
  vi.clearAllMocks();
  state.enabled = true;
  clearBranchCache();
  clearLocalityCache();
  client.listLocalities.mockResolvedValue([
    {
      idDeProvLocalidad: 1,
      localidad: 'CIUDAD AUTONOMA BUENOS AIRES',
      provincia: 'BA',
      codigosPostales: ['1043']
    }
  ]);
  client.listBranches.mockResolvedValue([BRANCH]);
  client.createOrder.mockResolvedValue(accepted());
  client.getTraces.mockResolvedValue([]);
});

afterEach(async () => {
  if (productId && originalWeight !== undefined) {
    await query('UPDATE products SET weight = $2 WHERE id = $1', [productId, originalWeight]);
    originalWeight = undefined;
  }
});

describe('createForOrder', () => {
  it('creates shipment for a processing web order', async () => {
    const { orderId, user } = await createOrder({ withCarrier: true });
    const before = await getOrderRow(orderId);

    const s = await domain.createForOrder(orderId, homeInput, user.id);

    expect(s.status).toBe('pending');
    expect(s.tracking_number).toBe(TRACKING);
    expect(s.group_number).toBe(GROUP);
    expect(s.label_url).toBe(LABEL_URL);
    expect(s.quoted_price).toBeNull();
    expect((s.request_payload as { idPedido: string }).idPedido).toBe(s.id);
    expect(client.createOrder).toHaveBeenCalledTimes(1);

    const order = await getOrderRow(orderId);
    expect(order.status).toBe('ready_to_ship');
    expect(order.shipping_cost).toBe(before.shipping_cost);
    expect(order.shipping_carrier_id).toBe(before.shipping_carrier_id);
    expect(order.shipping_carrier_id).not.toBeNull();
  });

  it("estado 'Creada' in response -> status 'created'", async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockResolvedValue(accepted('Creada'));
    const s = await domain.createForOrder(orderId, homeInput, null);
    expect(s.status).toBe('created');
  });

  it('works for an admin-created order without carrier', async () => {
    const { orderId, orderNumber } = await createOrder({ admin: true });
    expect(orderNumber.startsWith('ADM-')).toBe(true);
    const s = await domain.createForOrder(orderId, homeInput, null);
    expect(s.status).toBe('pending');
    expect((await getOrderRow(orderId)).status).toBe('ready_to_ship');
  });

  it('rejects pending_payment orders', async () => {
    const { orderId } = await createOrder({ status: 'pending_payment' });
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'SHIPMENT_ORDER_NOT_READY',
      statusCode: 409
    });
    expect(client.createOrder).not.toHaveBeenCalled();
  });

  it('home delivery without address -> ORDER_ADDRESS_REQUIRED; branch pickup on same order succeeds', async () => {
    const { orderId } = await createOrder({ address: false });
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'ORDER_ADDRESS_REQUIRED',
      statusCode: 422
    });
    const s = await domain.createForOrder(
      orderId,
      { serviceType: 'branch_pickup', branchId: '99' },
      null
    );
    expect(s.status).toBe('pending');
    expect((s.destination_branch as { id: string }).id).toBe('99');
    expect(s.contract).toBe('C-BRANCH');
  });

  it('invalid branch -> SHIPMENT_BRANCH_INVALID', async () => {
    const { orderId } = await createOrder();
    await expect(
      domain.createForOrder(orderId, { serviceType: 'branch_pickup', branchId: 'nope' }, null)
    ).rejects.toMatchObject({ code: 'SHIPMENT_BRANCH_INVALID', statusCode: 422 });
  });

  it('duplicate create -> SHIPMENT_ALREADY_EXISTS (409)', async () => {
    const { orderId } = await createOrder();
    await domain.createForOrder(orderId, homeInput, null);
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'SHIPMENT_ALREADY_EXISTS',
      statusCode: 409
    });
  });

  it('400 from Andreani -> error row and 422 ANDREANI_VALIDATION; retry succeeds afterwards', async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockRejectedValueOnce(
      new AndreaniError('VALIDATION', 'Bad request', {
        status: 400,
        fieldErrors: [{ field: 'destino.postal.calle', message: 'Calle inválida' }]
      })
    );
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'ANDREANI_VALIDATION',
      statusCode: 422,
      details: [{ field: 'destino.postal.calle', message: 'Calle inválida' }]
    });
    const rows = await query('SELECT status, error_message FROM shipments WHERE order_id = $1', [
      orderId
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe('error');
    expect(rows.rows[0].error_message).toContain('Calle inválida');
    expect((await getOrderRow(orderId)).status).toBe('processing');

    const s = await domain.createForOrder(orderId, homeInput, null);
    expect(s.status).toBe('pending');
  });

  it('timeout -> row stays requesting, returns it; applyCreateResult 208 resolves to pending', async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockRejectedValueOnce(new AndreaniError('TIMEOUT', 'timeout'));
    const s = await domain.createForOrder(orderId, homeInput, null);
    expect(s.status).toBe('requesting');
    expect(s.next_poll_at).not.toBeNull();
    expect((await getOrderRow(orderId)).status).toBe('processing');

    const resolved = await domain.applyCreateResult(s.id, { httpStatus: 208, body: body() });
    expect(resolved.status).toBe('pending');
    expect(resolved.tracking_number).toBe(TRACKING);
    expect((await getOrderRow(orderId)).status).toBe('ready_to_ship');
  });

  it('localidad unresolved and no override -> SHIPMENT_LOCALIDAD_REQUIRED with candidates', async () => {
    const { orderId } = await createOrder();
    client.listLocalities.mockResolvedValue([
      { idDeProvLocalidad: 1, localidad: 'ALFA', provincia: 'BA', codigosPostales: ['1043'] },
      { idDeProvLocalidad: 2, localidad: 'BETA', provincia: 'BA', codigosPostales: ['1043'] }
    ]);
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'SHIPMENT_LOCALIDAD_REQUIRED',
      statusCode: 422,
      details: ['ALFA', 'BETA']
    });
    const s = await domain.createForOrder(orderId, { ...homeInput, localidad: 'BETA' }, null);
    expect(s.localidad).toBe('BETA');
  });

  it('ANDREANI_DISABLED when integration is off', async () => {
    const { orderId } = await createOrder();
    state.enabled = false;
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toMatchObject({
      code: 'ANDREANI_DISABLED',
      statusCode: 503
    });
  });

  it('rejected pre-envio on create -> rejected, order not advanced', async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockResolvedValue(accepted('Rechazada'));
    const s = await domain.createForOrder(orderId, homeInput, null);
    expect(s.status).toBe('rejected');
    expect((await getOrderRow(orderId)).status).toBe('processing');
  });
});

describe('cancel and refresh', () => {
  it('cancel -> cancelling and client.cancelShipment called', async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    const out = await domain.cancelShipment(s.id);
    expect(out.status).toBe('cancelling');
    expect(client.cancelShipment).toHaveBeenCalledWith({
      contract: 'C-HOME',
      trackingNumber: TRACKING
    });
  });

  it("refresh on cancelling with 'Aceptado' -> cancelled, cancelled_at set, order back to processing", async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    await domain.cancelShipment(s.id);
    client.getCancellation.mockResolvedValue({ state: 'Aceptado' });
    const out = await domain.refreshShipment(s.id);
    expect(out.status).toBe('cancelled');
    expect(out.cancelled_at).not.toBeNull();
    expect((await getOrderRow(orderId)).status).toBe('processing');
    expect(client.getTraces).not.toHaveBeenCalled();
  });

  it("'Rechazado' -> status re-derived and error_message set", async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    await domain.cancelShipment(s.id);
    client.getCancellation.mockResolvedValue({ state: 'Rechazado', razon: 'Ya fue admitido' });
    const out = await domain.refreshShipment(s.id);
    expect(out.status).toBe('created'); // sin eventos: fallback 'created' (ruling 2)
    expect(out.error_message).toBe('Cancelación rechazada: Ya fue admitido');
  });

  it('pending answer keeps cancelling', async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    await domain.cancelShipment(s.id);
    client.getCancellation.mockResolvedValue({ state: 'Pendiente' });
    const out = await domain.refreshShipment(s.id);
    expect(out.status).toBe('cancelling');
    expect(out.next_poll_at).not.toBeNull();
  });

  it('cancel after physical admission (in_transit) -> SHIPMENT_NOT_CANCELLABLE', async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    await query("UPDATE shipments SET status = 'in_transit' WHERE id = $1", [s.id]);
    await expect(domain.cancelShipment(s.id)).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_CANCELLABLE',
      statusCode: 409
    });
    expect(client.cancelShipment).not.toHaveBeenCalled();
  });

  it("refresh pending -> getOrder 'Creada' -> created", async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    client.getOrder.mockResolvedValue(body('Creada'));
    const out = await domain.refreshShipment(s.id);
    expect(out.status).toBe('created');
    expect(client.getOrder).toHaveBeenCalledWith(TRACKING);
  });

  it("refresh pending -> getOrder 'Rechazada' -> rejected and order back to processing", async () => {
    const { orderId } = await createOrder();
    const s = await domain.createForOrder(orderId, homeInput, null);
    expect((await getOrderRow(orderId)).status).toBe('ready_to_ship');
    client.getOrder.mockResolvedValue(body('Rechazada'));
    const out = await domain.refreshShipment(s.id);
    expect(out.status).toBe('rejected');
    expect((await getOrderRow(orderId)).status).toBe('processing');
  });

  it("refresh created -> getTraces -> ingestEvents called with source 'pull'", async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockResolvedValue(accepted('Creada'));
    const s = await domain.createForOrder(orderId, homeInput, null);
    client.getTraces.mockResolvedValue([
      { Fecha: '2026-11-21T12:00:00', Ciclo: 'Distribución', Evento: 'Visita', Estado: 'En camino' }
    ]);
    await domain.refreshShipment(s.id);
    expect(client.getTraces).toHaveBeenCalledWith(TRACKING);
    expect(ingestEvents).toHaveBeenCalledWith(s.id, expect.any(Array), 'pull');
  });
});

describe('getLabel', () => {
  it('requesting shipment -> SHIPMENT_LABEL_NOT_READY (409)', async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockRejectedValueOnce(new AndreaniError('TIMEOUT', 'timeout'));
    const s = await domain.createForOrder(orderId, homeInput, null);
    await expect(domain.getLabel(s.id)).rejects.toMatchObject({
      code: 'SHIPMENT_LABEL_NOT_READY',
      statusCode: 409
    });
  });

  it('created -> uses group_number, falls back to tracking_number', async () => {
    const { orderId, orderNumber } = await createOrder();
    client.createOrder.mockResolvedValue(accepted('Creada'));
    client.getLabel.mockResolvedValue({
      contentType: 'application/pdf',
      data: Buffer.from('%PDF')
    });
    const s = await domain.createForOrder(orderId, homeInput, null);

    const label = await domain.getLabel(s.id);
    expect(client.getLabel).toHaveBeenLastCalledWith(GROUP, 'pdf');
    expect(label.contentType).toBe('application/pdf');
    expect(label.filename).toBe(`etiqueta-${orderNumber}.pdf`);

    await query('UPDATE shipments SET group_number = NULL WHERE id = $1', [s.id]);
    await domain.getLabel(s.id);
    expect(client.getLabel).toHaveBeenLastCalledWith(TRACKING, 'pdf');
  });
});

describe('previewForOrder', () => {
  it('product without weight -> warnings but canCreate true', async () => {
    const { orderId } = await createOrder();
    const w = await query('SELECT weight FROM products WHERE id = $1', [productId]);
    originalWeight = w.rows[0].weight;
    await query('UPDATE products SET weight = NULL WHERE id = $1', [productId]);

    const p = await domain.previewForOrder(orderId);
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(p.canCreate).toBe(true);
    expect(p.serviceType).toBe('home_delivery');
    expect(p.contract).toBe('C-HOME');
    expect(p.channel).toBe('B2C');
    expect(p.localidad.resolved).toBe('CIUDAD AUTONOMA BUENOS AIRES');
    expect(p.packages).toHaveLength(1);
  });

  it('ANDREANI_MODE disabled -> canCreate false with blockReason', async () => {
    const { orderId } = await createOrder();
    state.enabled = false;
    const p = await domain.previewForOrder(orderId);
    expect(p.canCreate).toBe(false);
    expect(p.blockReason).toMatch(/deshabilitad/i);
  });

  it('existing active shipment blocks creation', async () => {
    const { orderId } = await createOrder();
    await domain.createForOrder(orderId, homeInput, null);
    const p = await domain.previewForOrder(orderId);
    expect(p.canCreate).toBe(false);
    expect(p.blockReason).toBeTruthy();
  });
});

describe('previewForOrder service selection', () => {
  it('address-less order: default blocks, branch_pickup + branch_id allows', async () => {
    const { orderId } = await createOrder({ admin: true, address: false });
    const def = await domain.previewForOrder(orderId);
    expect(def.canCreate).toBe(false);
    expect(def.blockReason).toMatch(/sucursal/i);

    const p = await domain.previewForOrder(orderId, {
      serviceType: 'branch_pickup',
      branchId: '99'
    });
    expect(p.canCreate).toBe(true);
    expect(p.destinationBranch?.id).toBe('99');
    expect(p.contract).toBe('C-BRANCH');

    const none = await domain.previewForOrder(orderId, { serviceType: 'branch_pickup' });
    expect(none.canCreate).toBe(false);
    expect(none.blockReason).toBe('Elegí una sucursal Andreani');
  });
});

describe('createForOrder lease', () => {
  it('non-Andreani error leaves requesting row with next_poll_at about +5 min', async () => {
    const { orderId } = await createOrder();
    client.createOrder.mockRejectedValueOnce(new Error('boom'));
    await expect(domain.createForOrder(orderId, homeInput, null)).rejects.toThrow('boom');
    const r = await query<{ status: string; next_poll_at: Date }>(
      'SELECT status, next_poll_at FROM shipments WHERE order_id = $1',
      [orderId]
    );
    expect(r.rows[0].status).toBe('requesting');
    const diffMin = (r.rows[0].next_poll_at.getTime() - Date.now()) / 60_000;
    expect(diffMin).toBeGreaterThan(3.5);
    expect(diffMin).toBeLessThan(5.5);
  });
});

describe('listPickupBranches', () => {
  it('returns branches for the postcode', async () => {
    const list = await domain.listPickupBranches('1043', 5);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('99');
  });
});
