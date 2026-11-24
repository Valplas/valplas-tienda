// Rutas admin de producto/tiers: '' -> null y par unidad-contenido, vía HTTP.
// `validate` no reasigna req.body, así que la normalización la hace el repositorio.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import productRoutes from '../../modules/products/product.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestProduct } from '../helpers.js';

const ID = '00000000-0000-0000-0000-000000000001';
let server: Server;
let base: string;
const token = generateAccessToken({ id: ID, email: 'a@vitest.local', role: 'admin' });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(camelCaseResponse);
  app.use('/api/products', productRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/products`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function put(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function unitRow(id: string) {
  const r = await query<{ l: string | null; q: string | null; c: string | null }>(
    'SELECT unit_label AS l, unit_content_quantity AS q, unit_content_label AS c FROM products WHERE id = $1',
    [id]
  );
  return r.rows[0];
}

describe('PUT /api/products/:id (unidad)', () => {
  it("unitLabel '' se guarda como null", async () => {
    const p = await createTestProduct({ unit: { label: 'paquete' } });
    const res = await put(`/${p.id}`, { unitLabel: '' });
    expect(res.status).toBe(200);
    expect((await unitRow(p.id)).l).toBeNull();
  });

  it("{ unitContentQuantity: null, unitContentLabel: '' } limpia sin 500", async () => {
    const p = await createTestProduct({
      unit: { label: 'paquete', contentQuantity: 10, contentLabel: 'bolsas' }
    });
    const res = await put(`/${p.id}`, { unitContentQuantity: null, unitContentLabel: '' });
    expect(res.status).toBe(200);
    const row = await unitRow(p.id);
    expect(row.q).toBeNull();
    expect(row.c).toBeNull();
  });

  it('solo unitContentQuantity -> 400', async () => {
    const p = await createTestProduct();
    const res = await put(`/${p.id}`, { unitContentQuantity: 5 });
    expect(res.status).toBe(400);
  });

  it("{ unitContentQuantity: 5, unitContentLabel: '' } -> 400", async () => {
    const p = await createTestProduct();
    const res = await put(`/${p.id}`, { unitContentQuantity: 5, unitContentLabel: '' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/products/:id/price-tiers (label)', () => {
  it("label '' se guarda como null y 'Bulto' se conserva", async () => {
    const p = await createTestProduct({ tiers: [{ minQuantity: 1 }, { minQuantity: 10 }] });
    const res = await put(`/${p.id}/price-tiers`, {
      tiers: [
        { priceListId: p.priceListIds[0], minQuantity: 1, label: '' },
        { priceListId: p.priceListIds[1], minQuantity: 10, label: 'Bulto' }
      ]
    });
    expect(res.status).toBe(200);
    const r = await query<{ min_quantity: number; label: string | null }>(
      'SELECT min_quantity, label FROM product_price_tiers WHERE product_id = $1 ORDER BY min_quantity',
      [p.id]
    );
    expect(r.rows.map((x) => x.label)).toEqual([null, 'Bulto']);
  });
});
