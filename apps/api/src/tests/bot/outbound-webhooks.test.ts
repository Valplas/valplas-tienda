// apps/api/src/tests/bot/outbound-webhooks.test.ts
//
// Outbox de webhooks al bot: el trigger de la migración 051 encola los cambios de estado de
// órdenes WSP (y solo esas) y el job los entrega firmados, con reintentos.

import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../infrastructure/external/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/external/mercadopago.js')>()),
  createOrderPreference: vi.fn().mockResolvedValue('https://mp.test/init_point')
}));

import * as botDomain from '../../modules/bot/bot.domain.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import {
  deliverBotWebhooks,
  MAX_ATTEMPTS
} from '../../infrastructure/jobs/deliver-bot-webhooks.job.js';
import {
  sendBotWebhook,
  signWebhookBody
} from '../../infrastructure/external/bot-webhook.client.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createTestShipping,
  createTestTier,
  deleteTestTiers,
  randomMobilePhone,
  uniqueSuffix,
  type TestTier
} from '../helpers.js';

interface EventRow {
  id: string;
  event_type: string;
  payload: { order_number: string; status: string; previous_status: string };
  attempts: number;
  delivered_at: Date | null;
  failed_at: Date | null;
  last_error: string | null;
  next_attempt_at: Date;
}

async function eventsFor(orderId: string): Promise<EventRow[]> {
  const result = await query<EventRow>(
    `SELECT id, event_type, payload, attempts, delivered_at, failed_at, last_error, next_attempt_at
     FROM outbound_webhook_events WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  return result.rows;
}

describe('outbox de webhooks al bot', () => {
  let tier: TestTier;
  let carrierId: string;
  let customerId: string;
  let addressId: string;

  beforeEach(async () => {
    tier = await createTestTier(50, 1);
    carrierId = (await createTestShipping(1000)).carrierId;
    const { customer } = await botDomain.findOrCreateCustomer({
      phone: randomMobilePhone(),
      first_name: 'Webhook',
      email: `bot-${uniqueSuffix()}@vitest.local`
    });
    customerId = customer.id;
    addressId = (
      await botDomain.addCustomerAddress(customerId, {
        alias: 'Casa',
        street: 'Av. Vitest',
        street_number: '100',
        city: 'Buenos Aires',
        province: 'CABA',
        postcode: '1043',
        is_default: true
      })
    ).id;
  });

  afterEach(async () => {
    await deleteTestTiers([tier.tierId]);
  });

  async function createWspOrder() {
    const { order } = await botDomain.createOrder({
      customer_id: customerId,
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      items: [{ product_id: tier.productId, price_list_id: tier.priceListId, quantity: 1 }],
      idempotency_key: `test:${uniqueSuffix()}`
    });
    return order;
  }

  it('encola un evento por cada cambio de estado de una orden WSP', async () => {
    const order = await createWspOrder();
    expect(await eventsFor(order.id)).toEqual([]); // crear la orden no es un cambio de estado

    await orderRepository.updateOrderStatus(order.id, { status: 'payment_confirmed' }, customerId);

    const [event] = await eventsFor(order.id);
    expect(event.event_type).toBe('order.status_changed');
    expect(event.payload).toMatchObject({
      order_number: order.order_number,
      status: 'payment_confirmed',
      previous_status: 'pending_payment'
    });
  });

  it('no encola cambios de órdenes web', async () => {
    const { order } = await orderDomain.createOrder(customerId, {
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: tier.productId, price_list_id: tier.priceListId, quantity: 1 }]
    });
    expect(order.order_number).toMatch(/^VLP-/);
    expect(order.sales_channel).toBe('web');

    await orderRepository.updateOrderStatus(order.id, { status: 'cancelled' }, customerId);
    expect(await eventsFor(order.id)).toEqual([]);
  });

  it('entrega el evento con los datos del cliente y lo marca entregado', async () => {
    const order = await createWspOrder();
    await orderRepository.updateOrderStatus(order.id, { status: 'payment_confirmed' }, customerId);
    const send = vi.fn().mockResolvedValue(undefined);

    await deliverBotWebhooks({ url: 'https://bot.test/hook', secret: 'shh', send });

    const call = send.mock.calls.find(
      ([request]) => request.body.data.orderNumber === order.order_number
    );
    expect(call?.[0]).toMatchObject({
      url: 'https://bot.test/hook',
      secret: 'shh',
      eventType: 'order.status_changed',
      body: {
        type: 'order.status_changed',
        data: {
          orderNumber: order.order_number,
          status: 'payment_confirmed',
          statusLabel: 'Pago confirmado',
          previousStatus: 'pending_payment',
          customer: { id: customerId, firstName: 'Webhook' }
        }
      }
    });
    expect(call?.[0].body.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const [event] = await eventsFor(order.id);
    expect(event.delivered_at).not.toBeNull();
    expect(call?.[0].eventId).toBe(event.id);
  });

  it('reprograma con backoff si el bot falla y descarta tras el último intento', async () => {
    const order = await createWspOrder();
    await orderRepository.updateOrderStatus(order.id, { status: 'cancelled' }, customerId);
    const send = vi.fn().mockRejectedValue(new Error('El bot respondió HTTP 500'));

    await deliverBotWebhooks({ url: 'https://bot.test/hook', secret: 'shh', send });

    let [event] = await eventsFor(order.id);
    expect(event.attempts).toBe(1);
    expect(event.delivered_at).toBeNull();
    expect(event.failed_at).toBeNull();
    expect(event.last_error).toContain('HTTP 500');
    expect(new Date(event.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Último intento: vence ya y vuelve a fallar
    await query(
      'UPDATE outbound_webhook_events SET attempts = $2, next_attempt_at = NOW() WHERE id = $1',
      [event.id, MAX_ATTEMPTS - 1]
    );
    await deliverBotWebhooks({ url: 'https://bot.test/hook', secret: 'shh', send });

    [event] = await eventsFor(order.id);
    expect(event.attempts).toBe(MAX_ATTEMPTS);
    expect(event.failed_at).not.toBeNull();
  });
});

describe('sendBotWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('firma el body con HMAC-SHA256 sobre "<t>.<body>" (verificable por el bot)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await sendBotWebhook({
      url: 'https://bot.test/hook',
      secret: 'secreto',
      eventId: 'evt-1',
      eventType: 'order.status_changed',
      body: { hello: 'world' }
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bot.test/hook');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Valplas-Event-Id']).toBe('evt-1');

    // Verificación como la haría el bot
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(headers['X-Valplas-Signature']);
    expect(match).not.toBeNull();
    const [, t, v1] = match as RegExpExecArray;
    const expected = createHmac('sha256', 'secreto').update(`${t}.${init.body}`).digest('hex');
    expect(v1).toBe(expected);
    expect(headers['X-Valplas-Signature']).toBe(signWebhookBody(init.body, 'secreto', Number(t)));
  });

  it('tira error si el bot no responde 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      sendBotWebhook({
        url: 'https://bot.test/hook',
        secret: 's',
        eventId: 'evt-2',
        eventType: 'order.status_changed',
        body: {}
      })
    ).rejects.toThrow('HTTP 503');
  });
});
