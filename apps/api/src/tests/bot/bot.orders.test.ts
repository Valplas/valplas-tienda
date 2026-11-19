// apps/api/src/tests/bot/bot.orders.test.ts
//
// Cotización, órdenes WSP y link de pago del bot contra la DB real (triggers de stock
// incluidos). Mercado Pago mockeado. Cada test crea su presentación (tier), cliente,
// dirección y envío vitest-*; setup.ts limpia usuarios/órdenes/envíos y acá se borran los tiers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../infrastructure/external/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/external/mercadopago.js')>()),
  createOrderPreference: vi.fn()
}));

import * as botDomain from '../../modules/bot/bot.domain.js';
import { createOrderPreference } from '../../infrastructure/external/mercadopago.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createTestShipping,
  createTestTier,
  deleteTestTiers,
  getProductStock,
  randomMobilePhone,
  uniqueSuffix,
  type TestTier
} from '../helpers.js';

const SHIPPING_PRICE = 1500;
const BUNDLE_SIZE = 2;
const PAYMENT_URL = 'https://mp.test/init_point';

async function createCustomer() {
  const { customer } = await botDomain.findOrCreateCustomer({
    phone: randomMobilePhone(),
    first_name: 'Cliente',
    last_name: 'Bot',
    email: `bot-${uniqueSuffix()}@vitest.local`
  });
  return customer;
}

async function createAddress(customerId: string) {
  return botDomain.addCustomerAddress(customerId, {
    alias: 'Casa',
    street: 'Av. Vitest',
    street_number: '742',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1043',
    is_default: false
  });
}

describe('bot: cotización y órdenes', () => {
  let tier: TestTier;
  let carrierId: string;
  let customerId: string;
  let addressId: string;

  beforeEach(async () => {
    vi.mocked(createOrderPreference).mockReset();
    vi.mocked(createOrderPreference).mockResolvedValue(PAYMENT_URL);

    tier = await createTestTier(50, BUNDLE_SIZE);
    carrierId = (await createTestShipping(SHIPPING_PRICE)).carrierId;
    customerId = (await createCustomer()).id;
    addressId = (await createAddress(customerId)).id;
  });

  afterEach(async () => {
    await deleteTestTiers([tier.tierId]);
  });

  const item = (quantity: number, priceListId = tier.priceListId) => ({
    product_id: tier.productId,
    price_list_id: priceListId,
    quantity
  });

  const orderInput = (quantity = 1, idempotencyKey = `test:${uniqueSuffix()}`) => ({
    customer_id: customerId,
    shipping_address_id: addressId,
    shipping_carrier_id: carrierId,
    items: [item(quantity)],
    idempotency_key: idempotencyKey
  });

  it('el producto expone la presentación con precio por bulto', async () => {
    const product = await botDomain.getProduct(tier.productId);
    const presentation = product.presentations.find((p) => p.price_list_id === tier.priceListId);

    expect(product.purchasable).toBe(true);
    expect(presentation).toMatchObject({
      bundle_size: BUNDLE_SIZE,
      unit_price: tier.unitPrice,
      bundle_price: Math.trunc(tier.unitPrice * BUNDLE_SIZE * 100) / 100
    });
  });

  it('cotiza precio, stock y envío con la dirección del cliente', async () => {
    const result = await botDomain.quote({
      customer_id: customerId,
      shipping_address_id: addressId,
      items: [item(3)]
    });

    const bundlePrice = Math.trunc(tier.unitPrice * BUNDLE_SIZE * 100) / 100;
    expect(result.orderable).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.items[0]).toMatchObject({
      quantity: 3,
      units: 3 * BUNDLE_SIZE,
      bundle_price: bundlePrice
    });
    expect(result.subtotal).toBeCloseTo(Math.trunc(bundlePrice * 3 * 100) / 100, 2);
    const option = result.shipping?.options.find((o) => o.carrier_id === carrierId);
    expect(option?.price).toBeCloseTo(SHIPPING_PRICE, 2);
    expect(option?.total).toBeCloseTo(result.subtotal + SHIPPING_PRICE, 2);
  });

  it('informa por línea el stock insuficiente y una presentación inexistente', async () => {
    const result = await botDomain.quote({
      items: [item(1_000_000), item(1, '00000000-0000-4000-8000-000000000000')]
    });

    expect(result.orderable).toBe(false);
    expect(result.problems.map((p) => p.code)).toEqual([
      'INSUFFICIENT_STOCK',
      'PRICE_TIER_NOT_FOUND'
    ]);
    expect(result.shipping).toBeNull();
  });

  it('crea la orden WSP, reserva stock y devuelve el link de pago', async () => {
    const before = await getProductStock(tier.productId);

    const result = await botDomain.createOrder(orderInput(2));

    expect(result.created).toBe(true);
    expect(result.payment_url).toBe(PAYMENT_URL);
    expect(result.order.order_number).toMatch(/^WSP-\d{8}-\d{6}$/);
    expect(result.order.sales_channel).toBe('whatsapp');
    expect(result.order.status).toBe('pending_payment');
    expect(result.order.shipping_cost).toBeCloseTo(SHIPPING_PRICE, 2);
    expect(result.order.items[0]).toMatchObject({ quantity: 2, bundle_size: BUNDLE_SIZE });

    const after = await getProductStock(tier.productId);
    expect(after.reserved_stock).toBe(before.reserved_stock + 2 * BUNDLE_SIZE);

    const history = await query<{ notes: string }>(
      'SELECT notes FROM order_status_history WHERE order_id = $1',
      [result.order.id]
    );
    expect(history.rows[0].notes).toBe('Orden creada (WhatsApp)');

    const preference = vi.mocked(createOrderPreference).mock.calls[0][0];
    expect(preference.orderNumber).toBe(result.order.order_number);
    expect(preference.shippingCost).toBeCloseTo(SHIPPING_PRICE, 2);
    // El link vence 24h después de creada la orden (antes de la cancelación automática)
    const expectedExpiry = new Date(result.order.created_at).getTime() + 24 * 3600 * 1000;
    expect(Math.abs((preference.expiresAt as Date).getTime() - expectedExpiry)).toBeLessThan(1000);
  });

  it('es idempotente: la misma clave devuelve la misma orden sin reservar de nuevo', async () => {
    const key = `test:${uniqueSuffix()}`;
    const first = await botDomain.createOrder(orderInput(1, key));
    const stockAfterFirst = await getProductStock(tier.productId);

    const replay = await botDomain.createOrder(orderInput(1, key));

    expect(replay.created).toBe(false);
    expect(replay.order.id).toBe(first.order.id);
    expect(await getProductStock(tier.productId)).toEqual(stockAfterFirst);
  });

  it('rechaza reutilizar la clave de otro cliente con 409', async () => {
    const key = `test:${uniqueSuffix()}`;
    await botDomain.createOrder(orderInput(1, key));

    const other = await createCustomer();
    const otherAddress = await createAddress(other.id);
    await expect(
      botDomain.createOrder({
        ...orderInput(1, key),
        customer_id: other.id,
        shipping_address_id: otherAddress.id
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
  });

  it('rechaza una presentación que no aplica al producto (nunca vende a costo)', async () => {
    await expect(
      botDomain.createOrder({
        ...orderInput(),
        items: [item(1, '00000000-0000-4000-8000-000000000000')]
      })
    ).rejects.toMatchObject({ code: 'PRICE_TIER_NOT_FOUND', statusCode: 400 });
  });

  it('si Mercado Pago falla, devuelve la orden con paymentUrl null y el link se regenera', async () => {
    vi.mocked(createOrderPreference).mockRejectedValueOnce(new Error('MP caído'));

    const result = await botDomain.createOrder(orderInput());
    expect(result.created).toBe(true);
    expect(result.payment_url).toBeNull();

    const link = await botDomain.regeneratePaymentLink(result.order.order_number, {
      customer_id: customerId
    });
    expect(link.payment_url).toBe(PAYMENT_URL);
  });

  it('no regenera el link de una orden pagada ni vencida', async () => {
    const paid = await botDomain.createOrder(orderInput());
    await query("UPDATE orders SET status = 'payment_confirmed' WHERE id = $1", [paid.order.id]);
    await expect(
      botDomain.regeneratePaymentLink(paid.order.order_number, { customer_id: customerId })
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE', statusCode: 409 });

    const old = await botDomain.createOrder(orderInput());
    await query("UPDATE orders SET created_at = NOW() - INTERVAL '25 hours' WHERE id = $1", [
      old.order.id
    ]);
    await expect(
      botDomain.regeneratePaymentLink(old.order.order_number, { customer_id: customerId })
    ).rejects.toMatchObject({ code: 'ORDER_PAYMENT_EXPIRED', statusCode: 409 });
  });

  it('cancela una orden pendiente y libera el stock reservado', async () => {
    const before = await getProductStock(tier.productId);
    const { order } = await botDomain.createOrder(orderInput(1));

    const cancelled = await botDomain.cancelOrder(order.order_number, {
      customer_id: customerId,
      reason: 'Me equivoqué'
    });

    expect(cancelled.status).toBe('cancelled');
    expect(await getProductStock(tier.productId)).toEqual(before);
  });

  it('no muestra órdenes de otro cliente', async () => {
    const { order } = await botDomain.createOrder(orderInput());
    const other = await createCustomer();

    await expect(botDomain.getOrder(order.order_number, other.id)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      statusCode: 404
    });
    expect((await botDomain.getOrder(order.order_number, customerId)).id).toBe(order.id);
  });
});
