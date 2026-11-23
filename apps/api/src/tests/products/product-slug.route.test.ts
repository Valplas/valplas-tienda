// apps/api/src/tests/products/product-slug.route.test.ts
//
// GET /api/products/slug/:slug contra la DB: presentaciones descriptas, unit y sin priceListName.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import productRoutes from '../../modules/products/product.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { describePresentations } from '../../modules/catalog/presentation.js';
import { createTestProduct } from '../helpers.js';

let server: Server;
let base: string;

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

describe('GET /api/products/slug/:slug', () => {
  it('devuelve priceTiers descriptas, unit y nunca priceListName', async () => {
    const product = await createTestProduct({
      stock: 500,
      unit: { label: 'caja', contentQuantity: 100, contentLabel: 'unidades' },
      tiers: [{ minQuantity: 1 }, { minQuantity: 10, label: 'Bulto' }]
    });

    const response = await fetch(`${base}/slug/${product.slug}`);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    const data = body.data.product;
    expect(data).not.toHaveProperty('costPrice');
    expect(data.unit).toEqual({ label: 'caja', contains: { quantity: 100, of: 'unidades' } });
    expect(data.priceTiers).toHaveLength(2);
    for (const tier of data.priceTiers) {
      expect(tier).not.toHaveProperty('priceListName');
    }
    expect(data.priceTiers[1].label).toBe('Bulto');

    const views = describePresentations(
      { label: 'caja', contentQuantity: 100, contentLabel: 'unidades' },
      data.priceTiers.map((t: any) => ({
        priceListId: t.priceListId,
        minQuantity: t.minQuantity,
        unitPrice: t.unitPrice,
        label: t.minQuantity === 10 ? 'Bulto' : null
      }))
    );
    expect(data.priceTiers[1]).toEqual({
      priceListId: product.priceListIds[1],
      minQuantity: 10,
      unitPrice: views[1].unitPrice,
      bundlePrice: views[1].bundlePrice,
      label: 'Bulto',
      contains: '10 cajas (1.000 unidades)',
      savingsPercent: views[1].savingsPercent,
      description: views[1].description
    });
  });
});
