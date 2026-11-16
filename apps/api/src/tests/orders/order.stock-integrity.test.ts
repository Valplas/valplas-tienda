// apps/api/src/tests/orders/order.stock-integrity.test.ts
//
// Integridad de stock y precios por bulto contra la DB real (migraciones 044-047):
// - confirmar el pago descuenta real_quantity (unidades), no quantity (bultos)
// - cancelar un pedido pagado restituye real_quantity
// - un pedido que pasa a 'failed' libera la reserva
// - pedidos admin guardan unit_price / cost_price_snapshot POR BULTO, así
//   subtotal (trigger) y revenue (columna generada) quedan correctos
// - findUserWithStats no referencia orders.deleted_at (columna inexistente)
//
// Datos propios: usuario @vitest.local (lo limpia setup.ts) y un tier de bulto
// creado y borrado por cada test. El stock del producto se restaura al final.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import { findUserWithStats } from '../../modules/users/user.repository.js';
import {
  createTestUser,
  createTestAddress,
  createTestShipping,
  getTestProduct,
  getProductStock
} from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

const BUNDLE = 7;
const BUNDLES = 2;
const UNITS = BUNDLE * BUNDLES;

describe('integridad de stock y precios por bulto', () => {
  let userId: string;
  let carrierId: string;
  let addressId: string;
  let productId: string;
  let priceListId: string;
  let baseline: { stock: number; reserved_stock: number };

  beforeEach(async () => {
    userId = (await createTestUser()).id;
    addressId = (await createTestAddress(userId)).id;
    carrierId = (await createTestShipping(1500)).carrierId;

    productId = (await getTestProduct(UNITS + 5)).id;
    baseline = await getProductStock(productId);

    const priceList = await query<{ id: string }>(
      'SELECT id FROM price_lists WHERE is_active = true AND deleted_at IS NULL LIMIT 1'
    );
    priceListId = priceList.rows[0].id;

    // Tier de bulto propio: falla fuerte si el producto ya tiene uno con ese tamaño
    await query(
      `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity, is_active)
       VALUES ($1, $2, $3, true)`,
      [productId, priceListId, BUNDLE]
    );
  });

  afterEach(async () => {
    await query('DELETE FROM product_price_tiers WHERE product_id = $1 AND min_quantity = $2', [
      productId,
      BUNDLE
    ]);
    // Los pedidos de test se borran en setup.ts sin tocar stock: se restaura el snapshot
    await query('UPDATE products SET stock = $1, reserved_stock = $2 WHERE id = $3', [
      baseline.stock,
      baseline.reserved_stock,
      productId
    ]);
  });

  async function createBundleOrder(): Promise<string> {
    const { order } = await orderDomain.createOrder(userId, {
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: productId, quantity: BUNDLES, price_list_id: priceListId }]
    });
    return order.id;
  }

  it('reserva real_quantity al crear y descuenta real_quantity al confirmar el pago', async () => {
    const orderId = await createBundleOrder();

    const reserved = await getProductStock(productId);
    expect(reserved.reserved_stock).toBe(baseline.reserved_stock + UNITS);
    expect(reserved.stock).toBe(baseline.stock);

    await orderDomain.updateOrderStatus(orderId, { status: 'payment_confirmed' }, userId, true);

    const confirmed = await getProductStock(productId);
    expect(confirmed.stock).toBe(baseline.stock - UNITS);
    // La reserva se consume completa: sin remanente de (real_quantity - quantity)
    expect(confirmed.reserved_stock).toBe(baseline.reserved_stock);
  });

  it('cancelar un pedido pagado restituye real_quantity al stock', async () => {
    const orderId = await createBundleOrder();
    await orderDomain.updateOrderStatus(orderId, { status: 'payment_confirmed' }, userId, true);
    await orderDomain.cancelOrder(orderId, 'test', userId, true);

    const after = await getProductStock(productId);
    expect(after.stock).toBe(baseline.stock);
    expect(after.reserved_stock).toBe(baseline.reserved_stock);
  });

  it("pasar a 'failed' libera la reserva", async () => {
    const orderId = await createBundleOrder();
    expect((await getProductStock(productId)).reserved_stock).toBe(baseline.reserved_stock + UNITS);

    const failed = await orderDomain.updateOrderStatus(orderId, { status: 'failed' }, userId, true);

    expect(failed.status).toBe('failed');
    const after = await getProductStock(productId);
    expect(after.reserved_stock).toBe(baseline.reserved_stock);
    expect(after.stock).toBe(baseline.stock);
  });

  it('pedido admin: unit_price y costo por bulto, subtotal y revenue consistentes', async () => {
    const order = await orderDomain.createAdminOrder(userId, {
      user_id: userId,
      payment_method: 'manual',
      items: [{ product_id: productId, price_list_id: priceListId, quantity: BUNDLES }]
    });

    const row = (
      await query<{
        quantity: number;
        real_quantity: number;
        bundle_size_snapshot: number;
        unit_price: string;
        cost_price_snapshot: string;
        subtotal: string;
        revenue: string;
      }>(
        `SELECT quantity, real_quantity, bundle_size_snapshot, unit_price,
                cost_price_snapshot, subtotal, revenue
         FROM order_items WHERE order_id = $1`,
        [order.id]
      )
    ).rows[0];

    // Precio por unidad esperado: misma fórmula que calculatePrice (trunca a centavos)
    const perUnit = (
      await query<{ unit: string; cost: string }>(
        `SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS unit, p.cost_price AS cost
         FROM products p, price_lists pl WHERE p.id = $1 AND pl.id = $2`,
        [productId, priceListId]
      )
    ).rows[0];

    expect(row.bundle_size_snapshot).toBe(BUNDLE);
    expect(row.real_quantity).toBe(UNITS);
    expect(Number(row.unit_price)).toBeCloseTo(Number(perUnit.unit) * BUNDLE, 2);
    expect(Number(row.cost_price_snapshot)).toBeCloseTo(Number(perUnit.cost) * BUNDLE, 2);
    // subtotal lo fija el trigger: quantity (bultos) × unit_price (por bulto)
    expect(Number(row.subtotal)).toBeCloseTo(Number(row.unit_price) * BUNDLES, 2);
    expect(Number(row.revenue)).toBeCloseTo(
      (Number(row.unit_price) - Number(row.cost_price_snapshot)) * BUNDLES,
      2
    );
    // El subtotal de la orden coincide con la suma de las líneas
    expect(Number(order.subtotal)).toBeCloseTo(Number(row.subtotal), 2);
  });

  it('findUserWithStats no falla y cuenta pedidos', async () => {
    const before = await findUserWithStats(userId);
    expect(before).not.toBeNull();
    expect(Number(before?.total_orders)).toBe(0);

    await createBundleOrder();

    const after = await findUserWithStats(userId);
    expect(Number(after?.total_orders)).toBe(1);
    expect(after?.last_order_date).toBeTruthy();
  });
});
