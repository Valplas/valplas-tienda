// apps/api/src/tests/orders/order.admin-update.test.ts
//
// Edición admin de un pedido "En proceso" contra la DB real: cambio de
// dirección de entrega (bloqueado si el carrier es externo), costo de envío
// mantenido o recotizado y total = subtotal + envío. Datos propios por test:
// usuario @vitest.local, carrier + zonas vitest-*. La zona 1 cubre el CP A
// ($1500) y la zona 2 el CP B ($2500); el CP C no tiene tarifa del carrier.

import { describe, it, expect, beforeEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import {
  createTestUser,
  createTestAddress,
  createTestShipping,
  getTestProduct,
  uniqueSuffix
} from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

const CP_A = '1043';
const CP_B = '7600';
const CP_C = '9410';
const PRICE_A = 1500;
const PRICE_B = 2500;

describe('updateAdminOrder', () => {
  let userId: string;
  let carrierId: string;
  let productId: string;
  let priceListId: string;
  let addressA: string;
  let addressB: string;
  let addressC: string;
  let orderId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    addressA = (await createTestAddress(userId, CP_A)).id;
    addressB = (await createTestAddress(userId, CP_B)).id;
    addressC = (await createTestAddress(userId, CP_C)).id;

    const shipping = await createTestShipping(PRICE_A);
    carrierId = shipping.carrierId;
    await query('UPDATE shipping_zones SET excluded_postcodes = $1 WHERE id = $2', [
      JSON.stringify([CP_B, CP_C]),
      shipping.zoneId
    ]);
    const zone2 = await query<{ id: string }>(
      `INSERT INTO shipping_zones (name, provinces, excluded_postcodes, is_active)
       VALUES ($1, '[]', $2, true) RETURNING id`,
      [`vitest-zone-${uniqueSuffix()}`, JSON.stringify([CP_A, CP_C])]
    );
    await query(
      `INSERT INTO shipping_rates (
        zone_id, carrier_id, min_amount, max_amount, price,
        estimated_days_min, estimated_days_max, is_active
      ) VALUES ($1, $2, 0, NULL, $3, 1, 3, true)`,
      [zone2.rows[0].id, carrierId, PRICE_B]
    );

    productId = (await getTestProduct(10)).id;
    const priceList = await query<{ id: string }>(
      'SELECT id FROM price_lists WHERE is_active = true AND deleted_at IS NULL LIMIT 1'
    );
    priceListId = priceList.rows[0].id;

    // Pedido web pagado y en proceso, con envío cobrado a la dirección A
    const { order } = await orderDomain.createOrder(userId, {
      shipping_address_id: addressA,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: productId, quantity: 1 }]
    });
    orderId = order.id;
    await orderDomain.updateOrderStatus(orderId, { status: 'payment_confirmed' }, userId, true);
    await orderDomain.updateOrderStatus(orderId, { status: 'processing' }, userId, true);
  });

  const items = () => [{ product_id: productId, price_list_id: priceListId, quantity: 1 }];

  async function lastHistoryNote(): Promise<string> {
    const result = await query<{ notes: string }>(
      `SELECT notes FROM order_status_history
       WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    return result.rows[0].notes;
  }

  it('cambia la dirección manteniendo el costo de envío cobrado (default keep)', async () => {
    const updated = await orderDomain.updateAdminOrder(
      orderId,
      { shipping_address_id: addressB, items: items() },
      userId
    );

    expect(updated.shipping_postcode).toBe(CP_B);
    expect(updated.shipping_address_id).toBe(addressB);
    expect(updated.shipping_cost).toBeCloseTo(PRICE_A, 2);
    expect(updated.total).toBeCloseTo(updated.subtotal + PRICE_A, 2);
    expect(await lastHistoryNote()).toMatch(/se mantiene el costo/);
  });

  it('recalculate cotiza el carrier para la nueva dirección', async () => {
    const updated = await orderDomain.updateAdminOrder(
      orderId,
      { shipping_address_id: addressB, items: items(), shipping_cost_mode: 'recalculate' },
      userId
    );

    expect(updated.shipping_cost).toBeCloseTo(PRICE_B, 2);
    expect(updated.total).toBeCloseTo(updated.subtotal + PRICE_B, 2);
    expect(await lastHistoryNote()).toMatch(/diferencia a cobrar al cliente: \$1\.000,00/);
  });

  it('recalculate sin cambio de dirección → 400 SHIPPING_COST_NOT_RECALCULABLE', async () => {
    await expect(
      orderDomain.updateAdminOrder(
        orderId,
        { items: items(), shipping_cost_mode: 'recalculate' },
        userId
      )
    ).rejects.toMatchObject({ code: 'SHIPPING_COST_NOT_RECALCULABLE', statusCode: 400 });
  });

  it('recalculate a un CP sin tarifa del carrier → 400', async () => {
    const error = await orderDomain
      .updateAdminOrder(
        orderId,
        { shipping_address_id: addressC, items: items(), shipping_cost_mode: 'recalculate' },
        userId
      )
      .catch((e) => e);

    expect(error.statusCode).toBe(400);
    // Depende de las zonas reales de la DB: sin cobertura o con cobertura sin tarifa del carrier
    expect(['SHIPPING_RATE_NOT_FOUND', 'POSTCODE_NOT_COVERED', 'NO_SHIPPING_ZONES']).toContain(
      error.code
    );
  });

  it('permite una dirección sin tarifa/cobertura si se mantiene el costo', async () => {
    const updated = await orderDomain.updateAdminOrder(
      orderId,
      { shipping_address_id: addressC, items: items() },
      userId
    );

    expect(updated.shipping_postcode).toBe(CP_C);
    expect(updated.shipping_cost).toBeCloseTo(PRICE_A, 2);
  });

  it('sin shipping_address_id conserva el snapshot de la dirección', async () => {
    const updated = await orderDomain.updateAdminOrder(orderId, { items: items() }, userId);

    expect(updated.shipping_postcode).toBe(CP_A);
    expect(updated.shipping_street).toBe('Av. Vitest');
    expect(updated.total).toBeCloseTo(updated.subtotal + PRICE_A, 2);
  });

  describe('carrier externo', () => {
    beforeEach(async () => {
      await query('UPDATE shipping_carriers SET is_external = true WHERE id = $1', [carrierId]);
    });

    it('bloquea el cambio de dirección → 400 SHIPPING_ADDRESS_LOCKED', async () => {
      await expect(
        orderDomain.updateAdminOrder(
          orderId,
          { shipping_address_id: addressB, items: items() },
          userId
        )
      ).rejects.toMatchObject({ code: 'SHIPPING_ADDRESS_LOCKED', statusCode: 400 });
    });

    it('permite editar los items sin tocar la dirección y expone el flag en el detalle', async () => {
      const updated = await orderDomain.updateAdminOrder(
        orderId,
        { items: [{ ...items()[0], quantity: 2 }] },
        userId
      );

      expect(updated.shipping_postcode).toBe(CP_A);
      expect(updated.shipping_carrier_is_external).toBe(true);
    });

    it('reenviar la misma dirección sin cambios no cuenta como cambio', async () => {
      const updated = await orderDomain.updateAdminOrder(
        orderId,
        { shipping_address_id: addressA, items: items() },
        userId
      );

      expect(updated.shipping_postcode).toBe(CP_A);
    });

    it('la misma dirección con datos corregidos sí cuenta como cambio', async () => {
      await query("UPDATE user_addresses SET street = 'Calle Corregida' WHERE id = $1", [addressA]);

      await expect(
        orderDomain.updateAdminOrder(
          orderId,
          { shipping_address_id: addressA, items: items() },
          userId
        )
      ).rejects.toMatchObject({ code: 'SHIPPING_ADDRESS_LOCKED' });
    });
  });
});

describe('buildAdminEditNote', () => {
  const base = { previousAddress: 'A 1 (1043)', carrierName: 'Moto', currentShippingCost: 1500 };

  it('sin cambio de dirección solo registra la edición', () => {
    expect(
      orderDomain.buildAdminEditNote({ ...base, newAddress: null, newShippingCost: null })
    ).toBe('Pedido editado por administrador');
  });

  it('registra la diferencia a favor del cliente cuando el nuevo envío es más barato', () => {
    const note = orderDomain.buildAdminEditNote({
      ...base,
      newAddress: 'B 2 (7600)',
      newShippingCost: 1000
    });
    expect(note).toContain('Dirección: A 1 (1043) → B 2 (7600)');
    expect(note).toContain('diferencia a favor del cliente: $500,00');
  });
});
