// apps/api/src/tests/shipments/shipment.routes.test.ts
//
// Rutas admin de envíos: guard de rol y validación de entrada.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../../infrastructure/external/andreani/index.js', () => ({
  getAndreaniClient: () => {
    throw new Error('no debería llamarse');
  },
  isAndreaniEnabled: () => false,
  resetAndreaniClientForTests: vi.fn()
}));

import shipmentRoutes from '../../modules/shipments/shipment.routes.js';
import {
  createShipmentSchema,
  branchesQuerySchema
} from '../../modules/shipments/shipment.validators.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { createTestUser } from '../helpers.js';

const ID = '00000000-0000-0000-0000-000000000001';
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/shipments', shipmentRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/shipments`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const ROUTES: [string, string][] = [
  ['GET', `/orders/${ID}/preview`],
  ['POST', `/orders/${ID}`],
  ['POST', `/${ID}/cancel`],
  ['POST', `/${ID}/refresh`],
  ['GET', `/${ID}/label`],
  ['GET', '/branches?postcode=1043']
];

describe('role guard', () => {
  it('anonymous requests get 401', async () => {
    for (const [method, path] of ROUTES) {
      const res = await fetch(`${base}${path}`, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('customer requests get 403 on every route', async () => {
    const user = await createTestUser();
    for (const [method, path] of ROUTES) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: method === 'POST' ? '{}' : undefined
      });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

describe('validation', () => {
  const adminToken = () => generateAccessToken({ id: ID, email: 'a@vitest.local', role: 'admin' });

  it('schema rejects service_type drone and kilos 0', () => {
    expect(createShipmentSchema.safeParse({ service_type: 'drone' }).success).toBe(false);
    expect(
      createShipmentSchema.safeParse({
        service_type: 'home_delivery',
        packages: [{ kilos: 0, volume_cm3: 100 }]
      }).success
    ).toBe(false);
    expect(
      createShipmentSchema.safeParse({
        service_type: 'home_delivery',
        packages: [{ kilos: 2, volume_cm3: 100, largo_cm: 10 }]
      }).success
    ).toBe(true);
  });

  it('branches query accepts a postcode and rejects limit over 50', () => {
    expect(branchesQuerySchema.safeParse({ postcode: '1043' }).success).toBe(true);
    expect(branchesQuerySchema.safeParse({ postcode: '1043', limit: '51' }).success).toBe(false);
    expect(branchesQuerySchema.safeParse({}).success).toBe(false);
  });

  it('admin POST with invalid body -> 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${base}/orders/${ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_type: 'drone' })
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('admin GET /branches is not shadowed by /:id routes and answers 503 when disabled', async () => {
    const res = await fetch(`${base}/branches?postcode=1043`, {
      headers: { Authorization: `Bearer ${adminToken()}` }
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('ANDREANI_DISABLED');
  });
});
