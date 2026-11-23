// apps/api/src/tests/products/product-tags.test.ts
//
// Tags editables de producto y categoría: admin create/update, bot (unión con ancestros) y
// ausencia en la API pública.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import botRoutes from '../../modules/bot/bot.routes.js';
import productRoutes from '../../modules/products/product.routes.js';
import categoryRoutes from '../../modules/categories/category.routes.js';
import catalogRoutes from '../../modules/catalog/catalog.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { env } from '../../env.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestProduct, uniqueSuffix } from '../helpers.js';

const API_KEY = 'k'.repeat(64);
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
let server: Server;
let base: string;

const adminToken = () =>
  generateAccessToken({ id: ADMIN_ID, email: 'a@vitest.local', role: 'admin' });

beforeAll(async () => {
  env.BOT_API_KEYS.push(API_KEY);
  const app = express();
  app.use(express.json());
  app.use(camelCaseResponse);
  app.use('/api/bot', botRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  env.BOT_API_KEYS.splice(env.BOT_API_KEYS.indexOf(API_KEY), 1);
  await new Promise((resolve) => server.close(resolve));
});

async function call(
  path: string,
  init: { method?: string; body?: unknown; admin?: boolean; bot?: boolean } = {}
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.admin) headers.authorization = `Bearer ${adminToken()}`;
  if (init.bot) headers['x-api-key'] = API_KEY;
  const response = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  return { status: response.status, body: (await response.json()) as any };
}

async function productName(id: string): Promise<string> {
  const result = await query<{ name: string }>('SELECT name FROM products WHERE id = $1', [id]);
  return result.rows[0].name;
}

async function botProduct(name: string) {
  const { body } = await call(`/bot/catalog/products?search=${encodeURIComponent(name)}`, {
    bot: true
  });
  return body.data.find((p: any) => p.name === name);
}

describe('tags de producto', () => {
  it('PUT admin normaliza tags y el bot los devuelve junto a los de la categoría', async () => {
    const product = await createTestProduct({ categoryTags: ['telgopor', 'consorcio'] });
    const put = await call(`/products/${product.id}`, {
      method: 'PUT',
      admin: true,
      body: { tags: [' Burbuja ', 'burbuja', 'Consorcio', '', 'Bolsa  Residuo'] }
    });
    expect(put.status).toBe(200);
    expect(put.body.data.product.tags).toEqual(['burbuja', 'consorcio', 'bolsa residuo']);

    const bot = await botProduct(await productName(product.id));
    expect(bot.tags).toEqual(['burbuja', 'consorcio', 'bolsa residuo', 'telgopor']);
  });

  it('el bot incluye tags de categorías ancestras, sin duplicados', async () => {
    const product = await createTestProduct({ tags: ['posnet'] });
    const suffix = uniqueSuffix();
    const grand = await query<{ id: string }>(
      'INSERT INTO categories (name, slug, is_active, tags) VALUES ($1, $1, true, $2) RETURNING id',
      [`vitest-gp-${suffix}`, ['abuela', 'posnet']]
    );
    const parent = await query<{ id: string }>(
      `INSERT INTO categories (name, slug, is_active, parent_id, tags)
       VALUES ($1, $1, true, $2, $3) RETURNING id`,
      [`vitest-pa-${suffix}`, grand.rows[0].id, ['madre']]
    );
    await query('UPDATE categories SET parent_id = $1, tags = $2 WHERE id = $3', [
      parent.rows[0].id,
      ['hija'],
      product.categoryId
    ]);
    const bot = await botProduct(await productName(product.id));
    expect(bot.tags).toEqual(['posnet', 'hija', 'madre', 'abuela']);
  });

  it('producto sin tags -> [] en el bot', async () => {
    const product = await createTestProduct();
    const bot = await botProduct(await productName(product.id));
    expect(bot.tags).toEqual([]);
  });

  it('rechaza más de 30 tags o tags de más de 40 caracteres', async () => {
    const product = await createTestProduct();
    const tooMany = await call(`/products/${product.id}`, {
      method: 'PUT',
      admin: true,
      body: { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }
    });
    expect(tooMany.status).toBe(400);
    const tooLong = await call(`/products/${product.id}`, {
      method: 'PUT',
      admin: true,
      body: { tags: ['x'.repeat(41)] }
    });
    expect(tooLong.status).toBe(400);
  });

  it('el detalle admin incluye tags y la API pública no', async () => {
    const product = await createTestProduct({ tags: ['consorcio'] });
    const detail = await call(`/products/${product.id}`, { admin: true });
    expect(detail.body.data.product.tags).toEqual(['consorcio']);

    const slug = await call(`/products/slug/${product.slug}`);
    expect(slug.status).toBe(200);
    expect(slug.body.data.product).not.toHaveProperty('tags');

    const catalog = await call(`/catalog/products?search=${encodeURIComponent(product.name)}`);
    expect(catalog.body.data.length).toBeGreaterThan(0);
    for (const p of catalog.body.data) expect(p).not.toHaveProperty('tags');
  });
});

describe('tags de categoría', () => {
  it('create/update normalizan; el detalle público no las expone y el admin sí', async () => {
    const slug = `vitest-cat-${uniqueSuffix()}`;
    const created = await call('/categories', {
      method: 'POST',
      admin: true,
      body: { name: slug, slug, tags: [' Posnet ', 'posnet', 'Rollo  Térmico'] }
    });
    expect(created.status).toBe(201);
    expect(created.body.data.category.tags).toEqual(['posnet', 'rollo térmico']);
    const id = created.body.data.category.id;

    const updated = await call(`/categories/${id}`, {
      method: 'PUT',
      admin: true,
      body: { tags: ['Burbuja'] }
    });
    expect(updated.body.data.category.tags).toEqual(['burbuja']);

    const adminGet = await call(`/categories/${id}`, { admin: true });
    expect(adminGet.body.data.category.tags).toEqual(['burbuja']);
    const publicGet = await call(`/categories/${id}`);
    expect(publicGet.body.data.category).not.toHaveProperty('tags');
  });
});
