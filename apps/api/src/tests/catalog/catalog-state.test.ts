// apps/api/src/tests/catalog/catalog-state.test.ts
//
// Versión global del catálogo: los triggers de sentencia suben catalog_state.version.
// Cada caso corre en UNA transacción REPEATABLE READ con ROLLBACK: el snapshot aísla el
// resultado del tráfico concurrente de staging (misma DB) y no deja rastro.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PoolClient } from 'pg';
import pool from '../../infrastructure/database/client.js';
import botRoutes from '../../modules/bot/bot.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { env } from '../../env.js';
import { createTestProduct } from '../helpers.js';

async function readVersion(client: PoolClient): Promise<number> {
  const result = await client.query<{ version: string }>(
    'SELECT version FROM catalog_state WHERE id = 1'
  );
  return Number(result.rows[0].version);
}

/** Corre `statement` en una tx REPEATABLE READ y devuelve la versión antes y después. */
async function versionAround(
  statement: (client: PoolClient) => Promise<unknown>
): Promise<{ before: number; after: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const before = await readVersion(client);
    await statement(client);
    const after = await readVersion(client);
    return { before, after };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('catalog_state: versión global del catálogo', () => {
  it('UPDATE de price_lists sube la versión', async () => {
    const product = await createTestProduct();
    const { before, after } = await versionAround((client) =>
      client.query('UPDATE price_lists SET margin = margin WHERE id = $1', [
        product.priceListIds[0]
      ])
    );
    expect(after).toBeGreaterThan(before);
  });

  it('borrar un tier sube la versión', async () => {
    const product = await createTestProduct();
    const { before, after } = await versionAround((client) =>
      client.query('DELETE FROM product_price_tiers WHERE id = $1', [product.tierIds[0]])
    );
    expect(after).toBeGreaterThan(before);
  });

  it('un UPDATE que no toca filas no cambia la versión', async () => {
    const { before, after } = await versionAround((client) =>
      client.query('UPDATE products SET name = name WHERE false')
    );
    expect(after).toBe(before);
  });
});

describe('GET /api/bot/catalog/status', () => {
  const API_KEY = 'k'.repeat(64);
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

  it('devuelve versión y fechas con API key', async () => {
    const response = await fetch(`${base}/catalog/status`, { headers: { 'x-api-key': API_KEY } });
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.catalogVersion).toBe('number');
    expect(typeof body.data.catalogUpdatedAt).toBe('string');
    expect(typeof body.data.storeInfoUpdatedAt).toBe('string');
  });

  it('sin API key responde 401', async () => {
    const response = await fetch(`${base}/catalog/status`);
    expect(response.status).toBe(401);
  });
});
