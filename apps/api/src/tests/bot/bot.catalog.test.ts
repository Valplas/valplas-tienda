// apps/api/src/tests/bot/bot.catalog.test.ts
//
// Catálogo del bot: productos sin stock (include_out_of_stock), inStock y purchasable.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import botRoutes from '../../modules/bot/bot.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { env } from '../../env.js';
import { createTestProduct } from '../helpers.js';
import { describePresentations, productSummary } from '../../modules/catalog/presentation.js';

const API_KEY = 'k'.repeat(64);
let server: Server;
let base: string;

beforeAll(async () => {
  // El middleware lee env.BOT_API_KEYS en cada request
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

async function call(path: string, init: { method?: string; body?: string } = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY }
  });
  return { status: response.status, body: (await response.json()) as any };
}

// Sin coincidencia exacta la búsqueda pasa al modo relajado, que puede traer otros productos
// con alguna palabra del nombre: lo que importa es que el producto sin stock no aparezca
const listedIds = (body: { data: Array<{ id: string }> }): string[] => body.data.map((p) => p.id);

describe('bot catalog: productos sin stock', () => {
  it('no lista el producto sin stock por defecto', async () => {
    const product = await createTestProduct({ stock: 0 });
    const { status, body } = await call(
      `/catalog/products?search=${encodeURIComponent(product.name)}`
    );
    expect(status).toBe(200);
    expect(listedIds(body)).not.toContain(product.id);
  });

  it('con include_out_of_stock=false tampoco lo lista', async () => {
    const product = await createTestProduct({ stock: 0 });
    const { body } = await call(
      `/catalog/products?include_out_of_stock=false&search=${encodeURIComponent(product.name)}`
    );
    expect(listedIds(body)).not.toContain(product.id);
  });

  it('con include_out_of_stock=true lo lista con inStock false y purchasable false', async () => {
    const product = await createTestProduct({ stock: 0 });
    const { body } = await call(
      `/catalog/products?include_out_of_stock=true&search=${encodeURIComponent(product.name)}`
    );
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: product.id,
      availableStock: 0,
      inStock: false,
      purchasable: false
    });
  });

  it('un producto con stock es inStock y purchasable', async () => {
    const product = await createTestProduct({ stock: 5 });
    const { body } = await call(`/catalog/products/${product.id}`);
    expect(body.data.product).toMatchObject({ inStock: true, purchasable: true });
  });

  it('el detalle de un producto sin stock es purchasable false', async () => {
    const product = await createTestProduct({ stock: 0 });
    const { status, body } = await call(`/catalog/products/${product.id}`);
    expect(status).toBe(200);
    expect(body.data.product).toMatchObject({ inStock: false, purchasable: false });
  });

  it('rechaza un valor inválido de include_out_of_stock', async () => {
    const { status } = await call('/catalog/products?include_out_of_stock=maybe');
    expect(status).toBe(400);
  });

  it('cotizar un producto sin stock devuelve INSUFFICIENT_STOCK', async () => {
    const product = await createTestProduct({ stock: 0 });
    const { status, body } = await call('/quote', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ product_id: product.id, price_list_id: product.priceListIds[0], quantity: 1 }]
      })
    });
    expect(status).toBe(200);
    expect(body.data.problems[0].code).toBe('INSUFFICIENT_STOCK');
  });
});

describe('bot catalog: presentaciones descriptas', () => {
  const unit = { label: 'caja', contentQuantity: 100, contentLabel: 'unidades' };

  async function createDescribed() {
    return createTestProduct({
      stock: 500,
      unit,
      tiers: [{ minQuantity: 1 }, { minQuantity: 10, label: 'Bulto' }]
    });
  }

  function expectDescribed(product: { name: string }, data: any) {
    expect(data.unit).toEqual({ label: 'caja', contains: { quantity: 100, of: 'unidades' } });
    expect(data.presentations).toHaveLength(2);
    const views = describePresentations(
      unit,
      data.presentations.map((p: any) => ({
        priceListId: p.priceListId,
        minQuantity: p.bundleSize,
        unitPrice: p.unitPrice,
        label: p.bundleSize === 10 ? 'Bulto' : null
      }))
    );
    expect(data.presentations[0]).toMatchObject({ label: 'Caja', contains: '100 unidades' });
    expect(data.presentations[1]).toMatchObject({
      bundleSize: 10,
      label: 'Bulto',
      contains: '10 cajas (1.000 unidades)',
      savingsPercent: views[1].savingsPercent,
      description: views[1].description,
      bundlePrice: views[1].bundlePrice,
      availableBundles: 50
    });
    expect(data.presentations[1].description).toMatch(/^Bulto de 10 cajas \(1\.000 unidades\): \$/);
    expect(data.summary).toBe(productSummary(product.name, views));
  }

  it('el listado devuelve unit, summary y presentaciones con descripción', async () => {
    const product = await createDescribed();
    const { body } = await call(`/catalog/products?search=${encodeURIComponent(product.name)}`);
    expect(body.data).toHaveLength(1);
    expectDescribed(product, body.data[0]);
  });

  it('el detalle devuelve unit, summary y presentaciones con descripción', async () => {
    const product = await createDescribed();
    const { body } = await call(`/catalog/products/${product.id}`);
    expectDescribed(product, body.data.product);
  });

  it('producto sin unidad: unit null', async () => {
    const product = await createTestProduct({ stock: 5 });
    const { body } = await call(`/catalog/products/${product.id}`);
    expect(body.data.product.unit).toBeNull();
  });
});
