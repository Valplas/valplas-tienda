// apps/api/src/tests/orders/order.list.test.ts
//
// findOrders contra la DB real: items embebidos (LATERAL, sin GROUP BY), sin items cuando
// no se piden, y paginación determinista aunque varios pedidos compartan created_at.

import { describe, it, expect, afterEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import {
  createTestUser,
  createTestAddress,
  createTestShipping,
  createRawOrder,
  getTestProduct,
  getProductStock
} from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

describe('findOrders', () => {
  let restore: { productId: string; stock: number; reserved_stock: number } | null = null;

  afterEach(async () => {
    // setup.ts borra los pedidos de test sin tocar stock: se restaura el snapshot
    if (restore) {
      await query('UPDATE products SET stock = $1, reserved_stock = $2 WHERE id = $3', [
        restore.stock,
        restore.reserved_stock,
        restore.productId
      ]);
      restore = null;
    }
  });

  async function createOrderWithItem(userId: string, quantity: number) {
    const product = await getTestProduct(quantity + 5);
    const baseline = await getProductStock(product.id);
    restore = { productId: product.id, ...baseline };
    const addressId = (await createTestAddress(userId)).id;
    const carrierId = (await createTestShipping(1500)).carrierId;
    const { order } = await orderDomain.createOrder(userId, {
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: product.id, quantity }]
    });
    return { orderId: order.id, product };
  }

  it('embebe los items con el snapshot de nombre y SKU cuando includeItems', async () => {
    const userId = (await createTestUser()).id;
    const { orderId, product } = await createOrderWithItem(userId, 2);

    const { orders, total } = await orderRepository.findOrders({
      user_id: userId,
      includeItems: true
    });

    expect(total).toBe(1);
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(orderId);
    const items = (orders[0] as unknown as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: 2
    });
    expect(orders[0]).toHaveProperty('user');
    expect(orders[0]).toHaveProperty('shipping_address');
  });

  it('no incluye items si no se piden', async () => {
    const userId = (await createTestUser()).id;
    await createOrderWithItem(userId, 1);

    const { orders } = await orderRepository.findOrders({ user_id: userId });

    expect(orders).toHaveLength(1);
    expect(orders[0]).not.toHaveProperty('items');
  });

  it('un pedido sin items devuelve items = []', async () => {
    const userId = (await createTestUser()).id;
    await createRawOrder(userId);

    const { orders } = await orderRepository.findOrders({ user_id: userId, includeItems: true });

    expect((orders[0] as unknown as { items: unknown[] }).items).toEqual([]);
  });

  it('por cursor recorre todos los pedidos sin repetir, con total solo en la primera página', async () => {
    const userId = (await createTestUser()).id;
    const ids = [
      await createRawOrder(userId),
      await createRawOrder(userId),
      await createRawOrder(userId),
      await createRawOrder(userId),
      await createRawOrder(userId)
    ];
    // Mismo created_at con microsegundos: el desempate por id es lo único que ordena
    await query(
      "UPDATE orders SET created_at = '2026-01-15 12:00:00.123456+00' WHERE id = ANY($1)",
      [ids]
    );
    // Uno posterior y uno anterior para cruzar también distintos timestamps
    await query("UPDATE orders SET created_at = '2026-02-01 00:00:00+00' WHERE id = $1", [ids[0]]);
    await query("UPDATE orders SET created_at = '2025-12-01 00:00:00+00' WHERE id = $1", [ids[1]]);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let firstTotal: number | null | undefined;

    do {
      const page = await orderRepository.findOrders({ user_id: userId, limit: 2, cursor });
      if (pages === 0) firstTotal = page.total;
      else expect(page.total).toBeNull();
      seen.push(...page.orders.map((o) => o.id));
      expect(page.orders.length).toBeLessThanOrEqual(2);
      cursor = page.nextCursor ?? undefined;
      expect(page.hasMore).toBe(cursor !== undefined);
      pages++;
    } while (cursor && pages < 10);

    expect(firstTotal).toBe(5);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    // Orden: más reciente primero, el más antiguo al final
    expect(seen[0]).toBe(ids[0]);
    expect(seen[seen.length - 1]).toBe(ids[1]);
  });

  it('no expone el valor interno del cursor en los pedidos', async () => {
    const userId = (await createTestUser()).id;
    await createRawOrder(userId);

    const { orders } = await orderRepository.findOrders({ user_id: userId });

    expect(orders[0]).not.toHaveProperty('_k0');
  });

  it('rechaza un cursor inválido con 400', async () => {
    const userId = (await createTestUser()).id;

    await expect(
      orderRepository.findOrders({ user_id: userId, cursor: 'basura' })
    ).rejects.toMatchObject({ code: 'INVALID_CURSOR', statusCode: 400 });
  });

  it('pagina sin repetir ni saltear pedidos con el mismo created_at', async () => {
    const userId = (await createTestUser()).id;
    const ids = [
      await createRawOrder(userId),
      await createRawOrder(userId),
      await createRawOrder(userId)
    ];
    await query("UPDATE orders SET created_at = '2026-01-15T12:00:00Z' WHERE id = ANY($1)", [ids]);

    const page1 = await orderRepository.findOrders({ user_id: userId, page: 1, limit: 2 });
    const page2 = await orderRepository.findOrders({ user_id: userId, page: 2, limit: 2 });
    const seen = [...page1.orders, ...page2.orders].map((o) => o.id);

    expect(page1.total).toBe(3);
    expect(seen).toHaveLength(3);
    expect(new Set(seen)).toEqual(new Set(ids));
  });
});
