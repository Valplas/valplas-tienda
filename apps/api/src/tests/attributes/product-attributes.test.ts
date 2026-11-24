// apps/api/src/tests/attributes/product-attributes.test.ts
//
// Valores de atributos en productos: escritura admin (validada contra la definición) y lectura
// en bot, catálogo público, slug y detalle admin. Sin N+1: una query por página.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Passthrough con spy: permite contar las queries que tocan product_attribute_values
vi.mock('../../infrastructure/database/client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../infrastructure/database/client.js')>();
  return { ...original, query: vi.fn(original.query) };
});

import botRoutes from '../../modules/bot/bot.routes.js';
import productRoutes from '../../modules/products/product.routes.js';
import attributeRoutes from '../../modules/attributes/attribute.routes.js';
import catalogRoutes from '../../modules/catalog/catalog.routes.js';
import * as attributeRepository from '../../modules/attributes/attribute.repository.js';
import * as catalogRepository from '../../modules/catalog/catalog.repository.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { env } from '../../env.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestProduct, uniqueSuffix } from '../helpers.js';

const ID = '00000000-0000-0000-0000-000000000001';
const API_KEY = 'k'.repeat(64);
const token = generateAccessToken({ id: ID, email: 'a@vitest.local', role: 'admin' });
let server: Server;
let origin: string;

beforeAll(async () => {
  env.BOT_API_KEYS.push(API_KEY);
  const app = express();
  app.use(express.json());
  app.use(camelCaseResponse);
  app.use('/api/bot', botRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/attributes', attributeRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  env.BOT_API_KEYS.splice(env.BOT_API_KEYS.indexOf(API_KEY), 1);
  await new Promise((resolve) => server.close(resolve));
});

async function admin(method: string, path: string, body?: unknown) {
  const res = await fetch(`${origin}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function bot(path: string) {
  const res = await fetch(`${origin}/api/bot${path}`, { headers: { 'x-api-key': API_KEY } });
  return { status: res.status, json: (await res.json()) as any };
}

async function attrId(key: string): Promise<string> {
  const r = await query<{ id: string }>('SELECT id FROM attribute_definitions WHERE key = $1', [
    key
  ]);
  return r.rows[0].id;
}

async function valueCount(productId: string): Promise<number> {
  const r = await query<{ n: string }>(
    'SELECT COUNT(*) n FROM product_attribute_values WHERE product_id = $1',
    [productId]
  );
  return Number(r.rows[0].n);
}

async function newCategory(): Promise<string> {
  const slug = `vitest-pa-${uniqueSuffix()}`;
  const r = await query<{ id: string }>(
    'INSERT INTO categories (name, slug, is_active) VALUES ($1, $2, true) RETURNING id',
    [slug, slug]
  );
  return r.rows[0].id;
}

describe('lectura: bot', () => {
  it('GET /catalog/products/:id devuelve atributos ordenados con unidad', async () => {
    const p = await createTestProduct({
      attributes: [
        { key: 'color', value: 'blanco' },
        { key: 'micrones', value: 20 }
      ]
    });
    const { status, json } = await bot(`/catalog/products/${p.id}`);
    expect(status).toBe(200);
    expect(json.data.product.attributes).toEqual([
      { key: 'micrones', label: 'Micrones', value: 20, unit: 'µm' },
      { key: 'color', label: 'Color', value: 'blanco', unit: null }
    ]);
  });

  it('el listado incluye attributes (vacío si no hay)', async () => {
    const p = await createTestProduct({ attributes: [{ key: 'talle', value: 'M' }] });
    const empty = await createTestProduct({ name: `${p.name}-sin` });
    const list = await bot(`/catalog/products?search=${encodeURIComponent(p.name)}`);
    const byId = new Map(list.json.data.map((x: any) => [x.id, x]));
    expect((byId.get(p.id) as any).attributes).toEqual([
      { key: 'talle', label: 'Talle', value: 'M', unit: null }
    ]);
    expect((byId.get(empty.id) as any).attributes).toEqual([]);
  });

  it('una definición desactivada no aparece', async () => {
    const key = `vitest_${uniqueSuffix().replace(/[^a-z0-9]/gi, '')}`.toLowerCase();
    const def = await query<{ id: string }>(
      "INSERT INTO attribute_definitions (key, label, value_type) VALUES ($1, 'Vit', 'text') RETURNING id",
      [key]
    );
    const p = await createTestProduct({ attributes: [{ key: 'color', value: 'rojo' }] });
    await query(
      'INSERT INTO product_attribute_values (product_id, attribute_id, value_text) VALUES ($1, $2, $3)',
      [p.id, def.rows[0].id, 'x']
    );
    let keys = (await bot(`/catalog/products/${p.id}`)).json.data.product.attributes.map(
      (a: any) => a.key
    );
    expect(keys.sort()).toEqual(['color', key].sort());
    await query('UPDATE attribute_definitions SET is_active = false WHERE id = $1', [
      def.rows[0].id
    ]);
    keys = (await bot(`/catalog/products/${p.id}`)).json.data.product.attributes.map(
      (a: any) => a.key
    );
    expect(keys).toEqual(['color']);
  });
});

describe('lectura: catálogo público y slug', () => {
  it('GET /catalog/products incluye attributes', async () => {
    const p = await createTestProduct({ attributes: [{ key: 'micrones', value: 35 }] });
    const res = await fetch(`${origin}/api/catalog/products?search=${encodeURIComponent(p.name)}`);
    const json = (await res.json()) as any;
    expect(json.data[0].attributes).toEqual([
      { key: 'micrones', label: 'Micrones', value: 35, unit: 'µm' }
    ]);
  });

  it('GET /products/slug/:slug incluye attributes', async () => {
    const p = await createTestProduct({ attributes: [{ key: 'color', value: 'negro' }] });
    const res = await fetch(`${origin}/api/products/slug/${p.slug}`);
    const json = (await res.json()) as any;
    expect(json.data.product.attributes).toEqual([
      { key: 'color', label: 'Color', value: 'negro', unit: null }
    ]);
  });
});

describe('sin N+1', () => {
  it('50 productos: findValuesByProductIds y findPublicProductsByIds hacen 1 query de atributos', async () => {
    const categoryId = await newCategory();
    const suffix = uniqueSuffix().replace(/[^a-z0-9]/gi, '');
    const created = await query<{ id: string }>(
      `INSERT INTO products (sku, name, slug, category_id, cost_price, stock, reserved_stock, is_active)
       SELECT 'VITEST-N1-' || $1 || n, 'vitest-n1-' || n, 'vitest-n1-' || $1 || n, $2, 100, 10, 0, true
       FROM generate_series(1, 50) n RETURNING id`,
      [suffix, categoryId]
    );
    const ids = created.rows.map((r) => r.id);
    await query(
      `INSERT INTO product_attribute_values (product_id, attribute_id, value_number)
       SELECT pid, $2, 20 FROM unnest($1::uuid[]) pid`,
      [ids, await attrId('micrones')]
    );

    const spy = vi.mocked(query);
    const attributeQueries = () =>
      spy.mock.calls.filter(([sql]) => String(sql).includes('product_attribute_values')).length;

    const before = attributeQueries();
    const map = await attributeRepository.findValuesByProductIds(ids);
    expect(attributeQueries() - before).toBe(1);
    expect(map.size).toBe(50);
    expect(map.get(ids[0])).toEqual([
      { key: 'micrones', label: 'Micrones', value: 20, unit: 'µm' }
    ]);

    const before2 = attributeQueries();
    const products = await catalogRepository.findPublicProductsByIds(ids);
    expect(attributeQueries() - before2).toBe(1);
    expect(products).toHaveLength(50);
    expect(products.every((x) => x.attributes.length === 1)).toBe(true);
  });
});

describe('escritura admin', () => {
  it('PUT con attributes reemplaza los valores', async () => {
    const p = await createTestProduct({ attributes: [{ key: 'color', value: 'rojo' }] });
    const res = await admin('PUT', `/products/${p.id}`, {
      attributes: [
        { attributeId: await attrId('micrones'), value: 20 },
        { attributeId: await attrId('talle'), value: ' XL ' }
      ]
    });
    expect(res.status).toBe(200);
    const view = (await bot(`/catalog/products/${p.id}`)).json.data.product.attributes;
    expect(view.map((a: any) => [a.key, a.value])).toEqual([
      ['micrones', 20],
      ['talle', 'XL']
    ]);
    // el detalle admin trae attributeId y valueType
    expect(res.json.data.product.attributes[0]).toMatchObject({
      attributeId: await attrId('micrones'),
      key: 'micrones',
      valueType: 'number',
      value: 20
    });
  });

  it('PUT sin attributes no toca los valores; attributes [] los borra', async () => {
    const p = await createTestProduct({ attributes: [{ key: 'color', value: 'rojo' }] });
    expect((await admin('PUT', `/products/${p.id}`, { name: 'vitest-renamed' })).status).toBe(200);
    expect(await valueCount(p.id)).toBe(1);
    expect((await admin('PUT', `/products/${p.id}`, { attributes: [] })).status).toBe(200);
    expect(await valueCount(p.id)).toBe(0);
  });

  it('acepta números como string ("20,5" -> 20.5)', async () => {
    const p = await createTestProduct();
    const res = await admin('PUT', `/products/${p.id}`, {
      attributes: [{ attributeId: await attrId('micrones'), value: '20,5' }]
    });
    expect(res.status).toBe(200);
    expect((await bot(`/catalog/products/${p.id}`)).json.data.product.attributes[0].value).toBe(
      20.5
    );
  });

  it("'abc' para un atributo number -> 400 INVALID_ATTRIBUTE_VALUE y no guarda nada", async () => {
    const p = await createTestProduct({ attributes: [{ key: 'color', value: 'rojo' }] });
    const res = await admin('PUT', `/products/${p.id}`, {
      name: 'vitest-no-cambia',
      attributes: [{ attributeId: await attrId('micrones'), value: 'abc' }]
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_ATTRIBUTE_VALUE');
    expect(res.json.error.details).toBeDefined();
    const name = await query<{ name: string }>('SELECT name FROM products WHERE id = $1', [p.id]);
    expect(name.rows[0].name).toBe(p.name);
    expect(await valueCount(p.id)).toBe(1);
  });

  it("talle 'XXXL' (fuera de las opciones) -> 400", async () => {
    const p = await createTestProduct();
    const res = await admin('PUT', `/products/${p.id}`, {
      attributes: [{ attributeId: await attrId('talle'), value: 'XXXL' }]
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_ATTRIBUTE_VALUE');
  });

  it('atributo inexistente, inactivo o repetido -> 400', async () => {
    const p = await createTestProduct();
    const unknown = await admin('PUT', `/products/${p.id}`, {
      attributes: [{ attributeId: crypto.randomUUID(), value: 'x' }]
    });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error.code).toBe('INVALID_ATTRIBUTE_VALUE');

    const key = `vitest_${uniqueSuffix().replace(/[^a-z0-9]/gi, '')}`.toLowerCase();
    const inactive = await query<{ id: string }>(
      `INSERT INTO attribute_definitions (key, label, value_type, is_active)
       VALUES ($1, 'Vit', 'text', false) RETURNING id`,
      [key]
    );
    const res = await admin('PUT', `/products/${p.id}`, {
      attributes: [{ attributeId: inactive.rows[0].id, value: 'x' }]
    });
    expect(res.json.error.code).toBe('INVALID_ATTRIBUTE_VALUE');

    const color = await attrId('color');
    const dup = await admin('PUT', `/products/${p.id}`, {
      attributes: [
        { attributeId: color, value: 'a' },
        { attributeId: color, value: 'b' }
      ]
    });
    expect(dup.status).toBe(400);
    expect(dup.json.error.code).toBe('INVALID_ATTRIBUTE_VALUE');
  });

  it('POST crea el producto con sus atributos', async () => {
    const suffix = uniqueSuffix().replace(/[^a-z0-9]/gi, '');
    const res = await admin('POST', '/products', {
      sku: `VITEST-PA${suffix.toUpperCase()}`,
      name: `vitest-pa-${suffix}`,
      slug: `vitest-pa-${suffix}`,
      categoryId: await newCategory(),
      costPrice: 100,
      attributes: [{ attributeId: await attrId('color'), value: 'verde' }]
    });
    expect(res.status).toBe(201);
    expect(res.json.data.product.attributes).toMatchObject([{ key: 'color', value: 'verde' }]);
  });

  it('POST con valor inválido no crea el producto', async () => {
    const suffix = uniqueSuffix().replace(/[^a-z0-9]/gi, '');
    const sku = `VITEST-PB${suffix.toUpperCase()}`;
    const res = await admin('POST', '/products', {
      sku,
      name: `vitest-pb-${suffix}`,
      slug: `vitest-pb-${suffix}`,
      categoryId: await newCategory(),
      costPrice: 100,
      attributes: [{ attributeId: await attrId('micrones'), value: 'abc' }]
    });
    expect(res.status).toBe(400);
    const r = await query('SELECT 1 FROM products WHERE sku = $1', [sku]);
    expect(r.rows).toHaveLength(0);
  });
});

describe('PATCH /api/attributes/:id: opciones en uso', () => {
  it('quitar una opción usada -> 409 ATTRIBUTE_OPTION_IN_USE; una no usada se puede quitar', async () => {
    const key = `vitest_${uniqueSuffix().replace(/[^a-z0-9]/gi, '')}`.toLowerCase();
    const def = await query<{ id: string }>(
      `INSERT INTO attribute_definitions (key, label, value_type, options)
       VALUES ($1, 'Vit', 'option', '{a,b,c}') RETURNING id`,
      [key]
    );
    const id = def.rows[0].id;
    const p = await createTestProduct();
    await query(
      'INSERT INTO product_attribute_values (product_id, attribute_id, value_text) VALUES ($1, $2, $3)',
      [p.id, id, 'b']
    );

    const blocked = await admin('PATCH', `/attributes/${id}`, { options: ['a', 'c'] });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe('ATTRIBUTE_OPTION_IN_USE');
    expect(blocked.json.error.details).toEqual(['b']);

    const ok = await admin('PATCH', `/attributes/${id}`, { options: ['a', 'b'] });
    expect(ok.status).toBe(200);
  });
});
