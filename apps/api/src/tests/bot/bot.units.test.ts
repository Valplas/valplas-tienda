// apps/api/src/tests/bot/bot.units.test.ts
//
// /quote y /orders del bot por `units`: el servidor elige la combinación exacta más barata de
// presentaciones. Mercado Pago mockeado; DB real (triggers de stock incluidos).

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../infrastructure/external/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/external/mercadopago.js')>()),
  createOrderPreference: vi.fn()
}));

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import botRoutes from '../../modules/bot/bot.routes.js';
import * as botDomain from '../../modules/bot/bot.domain.js';
import { errorHandler, AppError } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { env } from '../../env.js';
import { findUnitsPlanMismatches } from '../../modules/bot/bot-units.js';
import { botOrderItemSchema } from '../../modules/bot/bot.validators.js';
import { pricingProblemToError } from '../../modules/orders/order-pricing.js';
import {
  bulkConfirmSchema,
  bulkPreviewSchema,
  replaceProductTiersSchema
} from '../../modules/products/price-tiers/price-tier.validator.js';
import { query } from '../../infrastructure/database/client.js';
import { createOrderPreference } from '../../infrastructure/external/mercadopago.js';
import {
  createTestProduct,
  createTestShipping,
  randomMobilePhone,
  uniqueSuffix
} from '../helpers.js';

const API_KEY = 'u'.repeat(64);
const SHIPPING_PRICE = 1500;
let server: Server;
let base: string;

beforeAll(async () => {
  env.BOT_API_KEYS.push(API_KEY);
  const app = express();
  app.use(express.json());
  app.use(camelCaseResponse);
  app.use('/api/bot', botRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bot`;
});

afterAll(async () => {
  env.BOT_API_KEYS.splice(env.BOT_API_KEYS.indexOf(API_KEY), 1);
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  vi.mocked(createOrderPreference).mockReset();
  vi.mocked(createOrderPreference).mockResolvedValue('https://mp.test/init_point');
});

async function post(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: (await response.json()) as any };
}

/** Precio unitario real de la lista (costo × margen), como lo calcula el catálogo. */
async function unitPriceOf(productId: string, priceListId: string): Promise<number> {
  const { rows } = await query<{ unit_price: string }>(
    `SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS unit_price
     FROM products p, price_lists pl WHERE p.id = $1 AND pl.id = $2`,
    [productId, priceListId]
  );
  return Number(rows[0].unit_price);
}

const bundlePrice = (unitPrice: number, size: number) => Math.trunc(unitPrice * size * 100) / 100;
const lineTotal = (price: number, qty: number) => Math.trunc(price * qty * 100) / 100;

async function createCustomerWithAddress() {
  const { customer } = await botDomain.findOrCreateCustomer({
    phone: randomMobilePhone(),
    first_name: 'Cliente',
    last_name: 'Units',
    email: `units-${uniqueSuffix()}@vitest.local`
  });
  const address = await botDomain.addCustomerAddress(customer.id, {
    alias: 'Casa',
    street: 'Av. Vitest',
    street_number: '742',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1043',
    is_default: false
  });
  return { customerId: customer.id, addressId: address.id };
}

describe('bot units: /quote', () => {
  it('12 unidades con tiers 1 y 10 → 1 bulto de 10 + 2 sueltas, subtotal exacto', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const [list1, list10] = product.priceListIds;
    const unit1 = await unitPriceOf(product.id, list1);
    const unit10 = await unitPriceOf(product.id, list10);

    const result = await botDomain.quote({ items: [{ product_id: product.id, units: 12 }] });

    const expected = lineTotal(bundlePrice(unit10, 10), 1) + lineTotal(bundlePrice(unit1, 1), 2);
    expect(result.problems).toEqual([]);
    expect(result.orderable).toBe(true);
    expect(result.requested).toHaveLength(1);
    const [requested] = result.requested;
    expect(requested.units).toBe(12);
    expect(requested.breakdown.map((l) => [l.bundle_size, l.quantity])).toEqual([
      [10, 1],
      [1, 2]
    ]);
    expect(requested.subtotal).toBeCloseTo(expected, 2);
    expect(result.subtotal).toBeCloseTo(expected, 2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toHaveProperty('label');
    expect(result.items[0]).toHaveProperty('description');
  });

  it('el formato viejo no cambia y reporta requested con units = quantity × bundle_size', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const result = await botDomain.quote({
      items: [{ product_id: product.id, price_list_id: product.priceListIds[1], quantity: 2 }]
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ quantity: 2, bundle_size: 10, units: 20 });
    expect(result.requested[0]).toMatchObject({ product_id: product.id, units: 20 });
    expect(result.requested[0].breakdown).toHaveLength(1);
  });

  it('producto con solo tier 10 y 12 unidades → UNITS_NOT_ACHIEVABLE con vecinos', async () => {
    const product = await createTestProduct({ stock: 100, tiers: [{ minQuantity: 10 }] });
    const result = await botDomain.quote({ items: [{ product_id: product.id, units: 12 }] });

    expect(result.orderable).toBe(false);
    expect(result.problems[0]).toMatchObject({
      code: 'UNITS_NOT_ACHIEVABLE',
      product_id: product.id,
      requested: 12,
      nearest_below: 10,
      nearest_above: 20
    });
    expect(result.requested[0]).toMatchObject({ units: 12, subtotal: 0, breakdown: [] });
  });

  it('producto sin tiers activos en modo units → PRICE_TIER_NOT_FOUND', async () => {
    const product = await createTestProduct({ stock: 100, tiers: [] });
    const result = await botDomain.quote({ items: [{ product_id: product.id, units: 3 }] });
    expect(result.problems[0]).toMatchObject({
      code: 'PRICE_TIER_NOT_FOUND',
      product_id: product.id
    });
  });

  it('units mayor al disponible mezclado con línea vieja → INSUFFICIENT_STOCK suma ambas', async () => {
    const product = await createTestProduct({
      stock: 15,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const result = await botDomain.quote({
      items: [
        { product_id: product.id, units: 12 },
        { product_id: product.id, price_list_id: product.priceListIds[0], quantity: 5 }
      ]
    });
    const stock = result.problems.filter((p) => p.code === 'INSUFFICIENT_STOCK');
    expect(stock.length).toBeGreaterThan(0);
    expect(stock[stock.length - 1]).toMatchObject({ available: 15, requested: 17 });
    expect(result.orderable).toBe(false);
  });

  it('dos ítems units del mismo producto (5 y 7) se planifican juntos como 12', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const result = await botDomain.quote({
      items: [
        { product_id: product.id, units: 5 },
        { product_id: product.id, units: 7 }
      ]
    });
    expect(result.items.map((l) => [l.bundle_size, l.quantity])).toEqual([
      [10, 1],
      [1, 2]
    ]);
    expect(result.requested).toHaveLength(2);
    expect(result.requested[0].units).toBe(5);
    expect(result.requested[0].breakdown).toHaveLength(2);
    expect(result.requested[0].subtotal).toBeCloseTo(result.subtotal, 2);
    expect(result.requested[1]).toMatchObject({
      units: 7,
      subtotal: 0,
      breakdown: [],
      merged_into: 0
    });
  });
});

describe('bot units: /orders', () => {
  it('crea la orden con el mismo desglose y total que la cotización', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const { customerId, addressId } = await createCustomerWithAddress();
    const carrierId = (await createTestShipping(SHIPPING_PRICE)).carrierId;
    const items = [{ product_id: product.id, units: 12 }];

    const quote = await botDomain.quote({ items });
    const result = await botDomain.createOrder({
      customer_id: customerId,
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      items,
      idempotency_key: `units:${uniqueSuffix()}`
    });

    expect(result.order.total - result.order.shipping_cost).toBeCloseTo(quote.subtotal, 2);
    expect(result.order.items.map((i) => [i.bundle_size, i.quantity, i.subtotal]).sort()).toEqual(
      quote.items.map((i) => [i.bundle_size, i.quantity, i.subtotal]).sort()
    );
  });

  it('UNITS_NOT_ACHIEVABLE → 422 con details', async () => {
    const product = await createTestProduct({ stock: 100, tiers: [{ minQuantity: 10 }] });
    const { customerId, addressId } = await createCustomerWithAddress();
    const carrierId = (await createTestShipping(SHIPPING_PRICE)).carrierId;

    const error = await botDomain
      .createOrder({
        customer_id: customerId,
        shipping_address_id: addressId,
        shipping_carrier_id: carrierId,
        items: [{ product_id: product.id, units: 12 }],
        idempotency_key: `units:${uniqueSuffix()}`
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'UNITS_NOT_ACHIEVABLE', statusCode: 422 });
    expect(error.details).toEqual({
      product_id: product.id,
      requested: 12,
      nearest_below: 10,
      nearest_above: 20
    });
  });
});

describe('bot units: validación HTTP', () => {
  it('ítem con units y price_list_id a la vez → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await post('/quote', {
      items: [
        {
          product_id: '00000000-0000-4000-8000-000000000001',
          price_list_id: '00000000-0000-4000-8000-000000000002',
          units: 3
        }
      ]
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ítem con units y price_list_id → 400 con mensaje claro', async () => {
    const { status, body } = await post('/quote', {
      items: [
        {
          product_id: '00000000-0000-4000-8000-000000000001',
          price_list_id: '00000000-0000-4000-8000-000000000002',
          units: 3
        }
      ]
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body.error)).toContain('units no se puede combinar');
  });

  it('ítem con units y quantity → 400', async () => {
    const { status, body } = await post('/quote', {
      items: [{ product_id: '00000000-0000-4000-8000-000000000001', units: 3, quantity: 2 }]
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body.error)).toContain('units no se puede combinar');
  });

  it('ítem histórico con claves extra se acepta (las extra se descartan)', () => {
    const parsed = botOrderItemSchema.parse({
      product_id: '00000000-0000-4000-8000-000000000001',
      price_list_id: '00000000-0000-4000-8000-000000000002',
      quantity: 2,
      bundle_size: 10,
      product_name: 'x'
    });
    expect(parsed).toEqual({
      product_id: '00000000-0000-4000-8000-000000000001',
      price_list_id: '00000000-0000-4000-8000-000000000002',
      quantity: 2
    });
    const unitsParsed = botOrderItemSchema.parse({
      product_id: '00000000-0000-4000-8000-000000000001',
      units: 3,
      product_name: 'x'
    });
    expect(unitsParsed).toEqual({
      product_id: '00000000-0000-4000-8000-000000000001',
      units: 3
    });
  });

  it('units fuera de rango → 400', async () => {
    for (const units of [0, 1.5, 100_001]) {
      const { status } = await post('/quote', {
        items: [{ product_id: '00000000-0000-4000-8000-000000000001', units }]
      });
      expect(status).toBe(400);
    }
  });

  it('POST /quote por HTTP devuelve requested en camelCase', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10 }]
    });
    const { status, body } = await post('/quote', {
      items: [{ product_id: product.id, units: 12 }]
    });
    expect(status).toBe(200);
    expect(body.data.requested[0]).toMatchObject({ productId: product.id, units: 12 });
    expect(body.data.requested[0].breakdown).toHaveLength(2);
  });
});

describe('bot units: listas repetidas entre presentaciones', () => {
  /** createTestProduct usa listas distintas: el segundo tier de la lista A se inserta a mano. */
  async function addTierOnSameList(productId: string, priceListId: string, minQuantity: number) {
    await query(
      `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity, is_active)
       VALUES ($1, $2, $3, true)`,
      [productId, priceListId, minQuantity]
    );
  }

  it('excluye del plan las presentaciones con lista repetida y nunca usa esa lista', async () => {
    const product = await createTestProduct({
      stock: 100,
      tiers: [{ minQuantity: 1 }, { minQuantity: 5 }]
    });
    const [listA, listB] = product.priceListIds;
    await addTierOnSameList(product.id, listA, 10);

    const reachable = await botDomain.quote({ items: [{ product_id: product.id, units: 15 }] });
    expect(reachable.problems).toEqual([]);
    expect(reachable.items.every((l) => l.price_list_id === listB)).toBe(true);
    expect(reachable.items.map((l) => [l.bundle_size, l.quantity])).toEqual([[5, 3]]);

    const unreachable = await botDomain.quote({ items: [{ product_id: product.id, units: 12 }] });
    expect(unreachable.problems[0]).toMatchObject({
      code: 'UNITS_NOT_ACHIEVABLE',
      nearest_below: 10,
      nearest_above: 15
    });
  });

  it('si todas las presentaciones son ambiguas → PRICE_TIER_NOT_FOUND', async () => {
    const product = await createTestProduct({ stock: 100, tiers: [{ minQuantity: 1 }] });
    await addTierOnSameList(product.id, product.priceListIds[0], 10);
    const result = await botDomain.quote({ items: [{ product_id: product.id, units: 12 }] });
    expect(result.problems[0]).toMatchObject({
      code: 'PRICE_TIER_NOT_FOUND',
      product_id: product.id
    });
  });
});

describe('findUnitsPlanMismatches', () => {
  const plan = {
    product_id: 'p1',
    product_name: 'Producto',
    units: 12,
    lineIndexes: [0, 1],
    bundleSizes: [10, 1]
  };

  it('sin diferencias no devuelve problemas', () => {
    expect(
      findUnitsPlanMismatches(
        [plan],
        [
          { item_index: 0, bundle_size_snapshot: 10, real_quantity: 10 },
          { item_index: 1, bundle_size_snapshot: 1, real_quantity: 2 }
        ]
      )
    ).toEqual([]);
  });

  it('bulto distinto al planificado (tier remapeado) → UNITS_PLAN_MISMATCH', () => {
    const [problem] = findUnitsPlanMismatches(
      [plan],
      [
        { item_index: 0, bundle_size_snapshot: 10, real_quantity: 10 },
        { item_index: 1, bundle_size_snapshot: 10, real_quantity: 20 }
      ]
    );
    expect(problem).toMatchObject({ code: 'UNITS_PLAN_MISMATCH', product_id: 'p1', requested: 12 });
  });

  it('unidades que no suman lo pedido → UNITS_PLAN_MISMATCH', () => {
    const problems = findUnitsPlanMismatches(
      [plan],
      [
        { item_index: 0, bundle_size_snapshot: 10, real_quantity: 30 },
        { item_index: 1, bundle_size_snapshot: 1, real_quantity: 2 }
      ]
    );
    expect(problems).toHaveLength(1);
  });

  it('se mapea a AppError 409', () => {
    const error = pricingProblemToError({
      code: 'UNITS_PLAN_MISMATCH',
      product_id: 'p1',
      product_name: 'Producto',
      requested: 12
    });
    expect(error).toMatchObject({ code: 'UNITS_PLAN_MISMATCH', statusCode: 409 });
    expect(error.details).toEqual({ product_id: 'p1' });
  });
});

describe('price-tier.validator: lista repetida', () => {
  const list = '00000000-0000-4000-8000-0000000000aa';
  const other = '00000000-0000-4000-8000-0000000000bb';
  const dup = [
    { priceListId: list, minQuantity: 1 },
    { priceListId: list, minQuantity: 10 }
  ];
  const ok = [
    { priceListId: list, minQuantity: 1 },
    { priceListId: other, minQuantity: 10 }
  ];
  const filter = { all: true };

  it('rechaza repetidos en replace, bulk preview y bulk confirm', () => {
    const message = 'No puede haber dos presentaciones con la misma lista de precios';
    for (const result of [
      replaceProductTiersSchema.safeParse({ tiers: dup }),
      bulkPreviewSchema.safeParse({ tiers: dup, filter }),
      bulkConfirmSchema.safeParse({ tiers: dup, filter, conflictResolution: 'skip' })
    ]) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(message);
    }
  });

  it('acepta listas distintas', () => {
    expect(replaceProductTiersSchema.safeParse({ tiers: ok }).success).toBe(true);
    expect(bulkPreviewSchema.safeParse({ tiers: ok, filter }).success).toBe(true);
  });
});
