// apps/api/src/tests/cart/cart.presentation.route.test.ts
//
// GET /api/cart contra la DB: cada línea trae presentationLabel / presentationContains.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import cartRoutes from '../../modules/cart/cart.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { createTestProduct } from '../helpers.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(camelCaseResponse);
  app.use('/api/cart', cartRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cart`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /api/cart: presentaciones descriptas', () => {
  it('la línea de bulto devuelve presentationLabel y presentationContains', async () => {
    const product = await createTestProduct({
      stock: 500,
      unit: { label: 'caja', contentQuantity: 100, contentLabel: 'unidades' },
      tiers: [{ minQuantity: 1 }, { minQuantity: 10, label: 'Bulto' }]
    });
    const cart = {
      items: [
        { productId: product.id, quantity: 1, priceListId: product.priceListIds[0] },
        { productId: product.id, quantity: 2, priceListId: product.priceListIds[1] }
      ]
    };

    const response = await fetch(base, {
      headers: { cookie: `cart=${encodeURIComponent(JSON.stringify(cart))}` }
    });
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    const items = body.data.cart.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      presentationLabel: 'Caja',
      presentationContains: '100 unidades'
    });
    expect(items[1]).toMatchObject({
      presentationLabel: 'Bulto',
      presentationContains: '10 cajas (1.000 unidades)'
    });
  });
});
