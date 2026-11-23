// apps/api/src/tests/orders/order-presentation-snapshot.test.ts
//
// order_items.presentation_label_snapshot: el texto de la presentación se guarda al comprar
// (bot, checkout web, admin) y no cambia si después se renombra el tier.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/external/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/external/mercadopago.js')>()),
  createOrderPreference: vi.fn()
}));

import * as botDomain from '../../modules/bot/bot.domain.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import { createOrderPreference } from '../../infrastructure/external/mercadopago.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createTestAddress,
  createTestProduct,
  createTestShipping,
  createTestUser,
  randomMobilePhone,
  uniqueSuffix
} from '../helpers.js';

const BULTO_TEXT = 'Bulto · 10 paquetes (1.000 bolsas)';

function productWithTiers() {
  return createTestProduct({
    stock: 500,
    unit: { label: 'paquete', contentQuantity: 100, contentLabel: 'bolsas' },
    tiers: [
      { minQuantity: 1, label: 'Paquete' },
      { minQuantity: 10, label: 'Bulto' }
    ]
  });
}

async function botCustomer() {
  const { customer } = await botDomain.findOrCreateCustomer({
    phone: randomMobilePhone(),
    first_name: 'Cliente',
    last_name: 'Snap',
    email: `snap-${uniqueSuffix()}@vitest.local`
  });
  const address = await botDomain.addCustomerAddress(customer.id, {
    alias: 'Casa',
    street: 'Av. Vitest',
    street_number: '742',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1043',
    is_default: false
  });
  return { customerId: customer.id, addressId: address.id };
}

async function snapshotsOf(orderId: string): Promise<(string | null)[]> {
  const { rows } = await query<{ presentation_label_snapshot: string | null }>(
    'SELECT presentation_label_snapshot FROM order_items WHERE order_id = $1 ORDER BY bundle_size_snapshot',
    [orderId]
  );
  return rows.map((r) => r.presentation_label_snapshot);
}

describe('snapshot de presentación en order_items', () => {
  beforeEach(() => {
    vi.mocked(createOrderPreference).mockReset();
    vi.mocked(createOrderPreference).mockResolvedValue('https://mp.test/init_point');
  });

  it('bot: guarda el texto, no cambia al renombrar el tier y se expone en el detalle', async () => {
    const product = await productWithTiers();
    const { customerId, addressId } = await botCustomer();
    const carrierId = (await createTestShipping(1500)).carrierId;

    const result = await botDomain.createOrder({
      customer_id: customerId,
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      items: [{ product_id: product.id, price_list_id: product.priceListIds[1], quantity: 1 }],
      idempotency_key: `test:${uniqueSuffix()}`
    });
    const orderId = (
      await query<{ id: string }>('SELECT id FROM orders WHERE order_number = $1', [
        result.order.order_number
      ])
    ).rows[0].id;

    expect(await snapshotsOf(orderId)).toEqual([BULTO_TEXT]);

    await query('UPDATE product_price_tiers SET label = $1 WHERE id = $2', [
      'Mayorista',
      product.tierIds[1]
    ]);
    expect(await snapshotsOf(orderId)).toEqual([BULTO_TEXT]);

    const detail = await botDomain.getOrder(result.order.order_number, customerId);
    expect(detail.items[0].presentation_label).toBe(BULTO_TEXT);
  });

  it('web: guarda el texto del tier en la línea', async () => {
    const product = await productWithTiers();
    const userId = (await createTestUser()).id;
    const address = await createTestAddress(userId);
    const { carrierId } = await createTestShipping(1500);

    const { order } = await orderDomain.createOrder(userId, {
      shipping_address_id: address.id,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: product.id, price_list_id: product.priceListIds[1], quantity: 1 }]
    });
    expect(await snapshotsOf(order.id)).toEqual([BULTO_TEXT]);
  });

  it('admin: create y edición de ítems llenan el snapshot', async () => {
    const product = await productWithTiers();
    const userId = (await createTestUser()).id;

    const order = await orderDomain.createAdminOrder(userId, {
      user_id: userId,
      payment_method: 'manual',
      items: [
        { product_id: product.id, price_list_id: product.priceListIds[1], quantity: 1 },
        { product_id: product.id, price_list_id: product.priceListIds[0], quantity: 2 }
      ]
    });
    expect(await snapshotsOf(order.id)).toEqual(['Paquete · 100 bolsas', BULTO_TEXT]);

    await orderDomain.updateAdminOrder(
      order.id,
      { items: [{ product_id: product.id, price_list_id: product.priceListIds[1], quantity: 2 }] },
      userId
    );
    expect(await snapshotsOf(order.id)).toEqual([BULTO_TEXT]);
  });
});
