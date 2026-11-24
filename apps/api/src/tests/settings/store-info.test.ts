// apps/api/src/tests/settings/store-info.test.ts
//
// Información del negocio: PUT/GET admin y GET del bot. store_settings es una fila real
// compartida (con el logo): se snapshotean y restauran solo las columnas de store info.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import settingsRoutes from '../../modules/settings/settings.routes.js';
import botRoutes from '../../modules/bot/bot.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { generateAccessToken } from '../../modules/auth/auth.service.js';
import { env } from '../../env.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser } from '../helpers.js';

const API_KEY = 'k'.repeat(64);
const COLUMNS = [
  'business_hours',
  'delivery_days',
  'delivery_zones',
  'minimum_order',
  'free_shipping_from',
  'payment_methods',
  'transfer_alias',
  'transfer_cbu',
  'transfer_holder',
  'transfer_bank',
  'pickup_address',
  'price_list_url',
  'contact_phone',
  'contact_email',
  'additional_info'
];
let server: Server;
let base: string;
let snapshot: Record<string, unknown>;
// updated_by tiene FK a users: el token admin se firma con un usuario de test real
async function adminToken() {
  const user = await createTestUser();
  return generateAccessToken({ id: user.id, email: user.email, role: 'admin' });
}

beforeAll(async () => {
  const res = await query(`SELECT ${COLUMNS.join(', ')} FROM store_settings WHERE id = 1`);
  snapshot = res.rows[0] as Record<string, unknown>;
  env.BOT_API_KEYS.push(API_KEY);
  const app = express();
  app.use(express.json());
  app.use(camelCaseResponse);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/bot', botRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  const sets = COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await query(
    `UPDATE store_settings SET ${sets} WHERE id = 1`,
    COLUMNS.map((c) => snapshot[c])
  );
  env.BOT_API_KEYS.splice(env.BOT_API_KEYS.indexOf(API_KEY), 1);
  await new Promise((resolve) => server.close(resolve));
});

async function put(body: unknown, token?: string) {
  token ??= await adminToken();
  const res = await fetch(`${base}/settings/store-info`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function botInfo() {
  const res = await fetch(`${base}/bot/store/info`, { headers: { 'x-api-key': API_KEY } });
  return { status: res.status, body: (await res.json()) as any };
}

const FULL = {
  business_hours: 'Lun a Vie 9 a 18',
  delivery_days: ['tuesday', 'friday', 'friday'],
  delivery_zones: [' CABA ', 'Zona Norte'],
  minimum_order: 50000,
  free_shipping_from: 150000.5,
  payment_methods: ['transfer', 'mercadopago'],
  transfer_alias: 'valplas.test',
  transfer_cbu: '1234567890123456789012',
  transfer_holder: 'Valplas SA',
  transfer_bank: 'Banco Test',
  pickup_address: 'Calle Falsa 123',
  price_list_url: 'https://valplas.net/lista.pdf',
  contact_phone: '011 4123-4567',
  contact_email: 'Ventas@Valplas.NET',
  additional_info: 'Info extra'
};

describe('store info', () => {
  it('PUT admin con todos los campos y el bot lo ve en camelCase', async () => {
    const put1 = await put(FULL);
    expect(put1.status).toBe(200);
    const { status, body } = await botInfo();
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      businessHours: 'Lun a Vie 9 a 18',
      deliveryDays: ['tuesday', 'friday'],
      deliveryZones: ['CABA', 'Zona Norte'],
      minimumOrder: 50000,
      freeShippingFrom: 150000.5,
      paymentMethods: ['transfer', 'mercadopago'],
      transferDetails: {
        alias: 'valplas.test',
        cbu: '1234567890123456789012',
        holder: 'Valplas SA',
        bank: 'Banco Test'
      },
      pickupAddress: 'Calle Falsa 123',
      priceListUrl: 'https://valplas.net/lista.pdf',
      contactPhone: '+541141234567',
      contactEmail: 'ventas@valplas.net',
      additionalInfo: 'Info extra'
    });
    expect(body.data.updatedAt).toBeTruthy();
  });

  it('GET admin devuelve lo guardado', async () => {
    await put(FULL);
    const res = await fetch(`${base}/settings/store-info`, {
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.storeInfo.businessHours).toBe('Lun a Vie 9 a 18');
  });

  it('el cambio es inmediato (caché invalidada) y los campos omitidos quedan null', async () => {
    await put(FULL);
    expect((await botInfo()).body.data.businessHours).toBe('Lun a Vie 9 a 18');
    await put({ business_hours: 'Solo sábados', contact_email: '' });
    const { body } = await botInfo();
    expect(body.data.businessHours).toBe('Solo sábados');
    expect(body.data.deliveryDays).toBeNull();
    expect(body.data.transferDetails).toBeNull();
    expect(body.data.contactEmail).toBeNull();
    expect(body.data.minimumOrder).toBeNull();
  });

  it('GET /api/settings público no expone datos de transferencia', async () => {
    await put(FULL);
    const res = await fetch(`${base}/settings`);
    const text = await res.text();
    expect(text).not.toContain('1234567890123456789012');
    expect(text).not.toContain('transfer');
  });

  it('customer recibe 403', async () => {
    const user = await createTestUser();
    const res = await put(FULL, user.accessToken);
    expect(res.status).toBe(403);
  });

  it('rechaza CBU inválido, URL http, teléfono, día y medio de pago inválidos', async () => {
    expect((await put({ transfer_cbu: '123' })).status).toBe(400);
    expect((await put({ price_list_url: 'http://valplas.net/x.pdf' })).status).toBe(400);
    expect((await put({ contact_phone: 'abc' })).status).toBe(400);
    expect((await put({ delivery_days: ['funday'] })).status).toBe(400);
    expect((await put({ payment_methods: ['bitcoin'] })).status).toBe(400);
  });

  it('el bot exige API key', async () => {
    const res = await fetch(`${base}/bot/store/info`);
    expect(res.status).toBe(401);
  });
});
