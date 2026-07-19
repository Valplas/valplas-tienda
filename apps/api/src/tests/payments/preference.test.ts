// apps/api/src/tests/payments/preference.test.ts
//
// Tests de la creación de preferencia de Checkout Pro: expiración,
// formato del teléfono del payer y warning cuando el webhook es inalcanzable.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const preferenceCreate = vi.fn();

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = preferenceCreate;
  },
  Payment: class {
    get = vi.fn();
  }
}));

vi.mock('../../env.js', () => ({
  env: {
    MP_ACCESS_TOKEN: 'TEST-token',
    MP_WEBHOOK_SECRET: 'test-secret',
    API_URL: 'http://localhost:3001',
    FRONTEND_URL: 'http://localhost:3000',
    IS_PRODUCTION: false
  }
}));

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { createOrderPreference } from '../../infrastructure/external/mercadopago.js';
import { logger } from '../../infrastructure/logger/index.js';
import { env } from '../../env.js';

const BASE_INPUT = {
  orderNumber: 'VLP-20260705-0001',
  items: [
    {
      id: 'prod-1',
      title: 'Producto Test',
      description: 'SKU-001',
      quantity: 2,
      unit_price: 1500.5
    }
  ]
};

function lastPreferenceBody() {
  const call = preferenceCreate.mock.calls.at(-1);
  return call?.[0]?.body;
}

beforeEach(() => {
  vi.clearAllMocks();
  preferenceCreate.mockResolvedValue({ init_point: 'https://mp.test/init' });
});

describe('createOrderPreference: expiración', () => {
  it('setea expires y expiration_date_to ~24h en el futuro con offset ISO 8601', async () => {
    await createOrderPreference(BASE_INPUT);

    const body = lastPreferenceBody();
    expect(body.expires).toBe(true);
    expect(body.expiration_date_to).toBeDefined();
    // Formato que exige MP: 2026-07-06T14:30:00.000-03:00 (offset con dos puntos)
    expect(body.expiration_date_to).toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/
    );

    const expiresAt = new Date(body.expiration_date_to).getTime();
    const expected = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60 * 1000);
  });
});

describe('createOrderPreference: payer.phone', () => {
  it('envía el número nacional (sin prefijo +54) cuando el teléfono viene en E.164', async () => {
    await createOrderPreference({
      ...BASE_INPUT,
      payer: { email: 'test@test.com', phone: '+5491122334455' }
    });

    const body = lastPreferenceBody();
    expect(body.payer.phone).toBeDefined();
    expect(body.payer.phone.number).not.toContain('+');
    expect(body.payer.phone.number).not.toMatch(/^54/);
    expect(body.payer.phone.number).toMatch(/^\d+$/);
  });

  it('omite phone si el teléfono no es parseable', async () => {
    await createOrderPreference({
      ...BASE_INPUT,
      payer: { email: 'test@test.com', phone: 'no-es-un-telefono' }
    });

    const body = lastPreferenceBody();
    expect(body.payer.phone).toBeUndefined();
  });
});

describe('createOrderPreference: notification_url', () => {
  it('loggea warning cuando API_URL apunta a localhost (webhook inalcanzable para MP)', async () => {
    await createOrderPreference(BASE_INPUT);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('localhost'));
  });

  it('no loggea warning con una URL pública', async () => {
    (env as { API_URL: string }).API_URL = 'https://api.valplas.net';

    await createOrderPreference(BASE_INPUT);

    expect(logger.warn).not.toHaveBeenCalled();

    (env as { API_URL: string }).API_URL = 'http://localhost:3001';
  });
});

describe('createOrderPreference: contrato existente', () => {
  it('mantiene external_reference, currency ARS y statement_descriptor', async () => {
    await createOrderPreference({ ...BASE_INPUT, shippingCost: 2500 });

    const body = lastPreferenceBody();
    expect(body.external_reference).toBe('VLP-20260705-0001');
    expect(body.items[0].currency_id).toBe('ARS');
    expect(body.statement_descriptor).toBe('VALPLAS');
  });
});

describe('createOrderPreference: envío como ítem', () => {
  // El comprobante compartible de MP muestra transaction_amount, que EXCLUYE
  // shipments.cost: con envío $25 el cliente pagaba $80 pero el comprobante
  // decía $55. El envío viaja como ítem para que el comprobante muestre el
  // total realmente pagado.
  it('agrega el envío como último ítem y no manda nodo shipments', async () => {
    await createOrderPreference({ ...BASE_INPUT, shippingCost: 2500 });

    const body = lastPreferenceBody();
    expect(body.shipments).toBeUndefined();
    expect(body.items).toHaveLength(2);
    expect(body.items.at(-1)).toMatchObject({
      title: 'Envío',
      quantity: 1,
      unit_price: 2500,
      currency_id: 'ARS'
    });
  });

  it('sin costo de envío no agrega ítem Envío ni nodo shipments', async () => {
    await createOrderPreference({ ...BASE_INPUT, shippingCost: 0 });

    const body = lastPreferenceBody();
    expect(body.shipments).toBeUndefined();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('Producto Test');
  });
});
