// apps/api/src/tests/attributes/attributes.test.ts
//
// Diccionario de atributos: CRUD admin, asignación a categorías y herencia por ancestros.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import attributeRoutes from '../../modules/attributes/attribute.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser, createTestProduct, uniqueSuffix } from '../helpers.js';

const ID = '00000000-0000-0000-0000-000000000001';
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/attributes', attributeRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/attributes`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const adminToken = () => generateAccessToken({ id: ID, email: 'a@vitest.local', role: 'admin' });

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

async function createCategory(parentId: string | null = null): Promise<string> {
  const slug = `vitest-attr-${uniqueSuffix()}`;
  const r = await query<{ id: string }>(
    'INSERT INTO categories (name, slug, parent_id, is_active) VALUES ($1, $2, $3, true) RETURNING id',
    [slug, slug, parentId]
  );
  return r.rows[0].id;
}

const newKey = () =>
  `vitest_${uniqueSuffix()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()}`;

async function createAttr(extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/', {
    key: newKey(),
    label: 'A',
    value_type: 'text',
    ...extra
  });
  return res.json.data.attribute.id as string;
}

describe('guards', () => {
  it('anonymous 401, customer 403', async () => {
    expect((await fetch(base)).status).toBe(401);
    const user = await createTestUser();
    const res = await fetch(base, { headers: { Authorization: `Bearer ${user.accessToken}` } });
    expect(res.status).toBe(403);
  });
});

describe('definitions CRUD', () => {
  it('seed has the 10 keys', async () => {
    const r = await query<{ n: string }>(
      'SELECT COUNT(*) n FROM attribute_definitions WHERE key = ANY($1)',
      [
        [
          'ancho',
          'alto',
          'profundidad',
          'micrones',
          'largo',
          'gramaje',
          'peso',
          'capacidad',
          'color',
          'talle'
        ]
      ]
    );
    expect(Number(r.rows[0].n)).toBe(10);
  });

  it('creates a number attribute and lists it with its categories', async () => {
    const key = newKey();
    const created = await call('POST', '/', {
      key,
      label: 'Test',
      value_type: 'number',
      unit: 'cm',
      aliases: [' Foo ', 'foo', 'BAR']
    });
    expect(created.status).toBe(201);
    expect(created.json.data.attribute.aliases).toEqual(['foo', 'bar']);

    const list = await call('GET', '/?limit=200');
    expect(list.status).toBe(200);
    const found = list.json.data.find((a: { key: string }) => a.key === key);
    expect(found).toBeDefined();
    expect(found.categories).toEqual([]);
  });

  it('duplicate key -> 409', async () => {
    const key = newKey();
    await call('POST', '/', { key, label: 'A', value_type: 'text' });
    const dup = await call('POST', '/', { key, label: 'B', value_type: 'text' });
    expect(dup.status).toBe(409);
  });

  it('options rules: required for option, forbidden otherwise', async () => {
    const noOpts = await call('POST', '/', { key: newKey(), label: 'A', value_type: 'option' });
    expect(noOpts.status).toBe(400);
    const extra = await call('POST', '/', {
      key: newKey(),
      label: 'A',
      value_type: 'number',
      options: ['x']
    });
    expect(extra.status).toBe(400);
    const ok = await call('POST', '/', {
      key: newKey(),
      label: 'A',
      value_type: 'option',
      options: ['S', 'M']
    });
    expect(ok.status).toBe(201);
  });

  it('invalid key slug -> 400', async () => {
    const res = await call('POST', '/', { key: 'Bad Key', label: 'A', value_type: 'text' });
    expect(res.status).toBe(400);
  });

  it('PATCH with key -> 400; PATCH label works', async () => {
    const id = await createAttr();
    expect((await call('PATCH', `/${id}`, { key: 'otra' })).status).toBe(400);
    const ok = await call('PATCH', `/${id}`, { label: 'Nuevo', is_active: false });
    expect(ok.status).toBe(200);
    expect(ok.json.data.attribute.label).toBe('Nuevo');
    expect(ok.json.data.attribute.isActive).toBe(false);
  });

  it('PATCH/DELETE unknown id -> 404', async () => {
    expect((await call('PATCH', `/${ID}`, { label: 'x' })).status).toBe(404);
    expect((await call('DELETE', `/${ID}`)).status).toBe(404);
  });

  it('DELETE removes an unused definition', async () => {
    const id = await createAttr();
    expect((await call('DELETE', `/${id}`)).status).toBe(200);
  });

  it('DELETE with values -> 409 ATTRIBUTE_IN_USE', async () => {
    const id = await createAttr();
    const product = await createTestProduct();
    await query(
      'INSERT INTO product_attribute_values (product_id, attribute_id, value_text) VALUES ($1, $2, $3)',
      [product.id, id, 'rojo']
    );
    const res = await call('DELETE', `/${id}`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('ATTRIBUTE_IN_USE');
  });
});

describe('category assignment', () => {
  it('for-category returns own + ancestors once, active only', async () => {
    const parent = await createCategory();
    const child = await createCategory(parent);
    const a = await createAttr();
    const b = await createAttr();
    const inactive = await createAttr();
    await call('PATCH', `/${inactive}`, { is_active: false });

    // a en padre e hijo (duplicado), b solo en padre, inactiva en hijo
    expect((await call('PUT', `/${a}/categories`, { category_ids: [parent, child] })).status).toBe(
      200
    );
    expect((await call('PUT', `/${b}/categories`, { category_ids: [parent] })).status).toBe(200);
    await call('PUT', `/${inactive}/categories`, { category_ids: [child] });

    const res = await call('GET', `/for-category/${child}`);
    expect(res.status).toBe(200);
    const ids = res.json.data.map((x: { id: string }) => x.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([a, b]));

    const own = await call('GET', `/for-category/${parent}`);
    expect(own.json.data).toHaveLength(2);

    // reemplazo total
    await call('PUT', `/${a}/categories`, { category_ids: [] });
    const after = await call('GET', `/for-category/${child}`);
    expect(after.json.data.map((x: { id: string }) => x.id)).toEqual([b]);
  });

  it('PUT with unknown category -> 404', async () => {
    const a = await createAttr();
    expect(
      (
        await call('PUT', `/${a}/categories`, {
          category_ids: ['6f1d3c1e-8a52-4b7e-9d0a-2b6f5c4e1a77']
        })
      ).status
    ).toBe(404);
  });
});
