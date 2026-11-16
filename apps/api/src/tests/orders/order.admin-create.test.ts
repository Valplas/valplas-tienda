// apps/api/src/tests/orders/order.admin-create.test.ts
//
// createAdminOrder / updateAdminOrder: precios y bultos de todos los ítems se resuelven en lote
// (3 queries). Se verifica el total con varios productos y los errores que ya existían.
// Restaura el stock de los productos usados (setup.ts borra los pedidos sin tocar stock).

import { describe, it, expect, afterEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import { createTestUser, getProductStock } from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

describe('pedidos admin con precios en lote', () => {
  const snapshots: { id: string; stock: number; reserved_stock: number }[] = [];

  afterEach(async () => {
    for (const s of snapshots.splice(0)) {
      await query('UPDATE products SET stock = $1, reserved_stock = $2 WHERE id = $3', [
        s.stock,
        s.reserved_stock,
        s.id
      ]);
    }
  });

  async function twoProducts(): Promise<string[]> {
    const rows = await query<{ id: string }>(
      `SELECT id FROM products
       WHERE is_active = true AND deleted_at IS NULL AND (stock - reserved_stock) >= 10
       ORDER BY created_at LIMIT 2`
    );
    expect(rows.rows).toHaveLength(2);
    for (const { id } of rows.rows) {
      snapshots.push({ id, ...(await getProductStock(id)) });
    }
    return rows.rows.map((r) => r.id);
  }

  async function priceListId(): Promise<string> {
    const r = await query<{ id: string }>(
      'SELECT id FROM price_lists WHERE is_active = true AND deleted_at IS NULL LIMIT 1'
    );
    return r.rows[0].id;
  }

  it('crea un pedido con varios productos y el subtotal suma las líneas', async () => {
    const userId = (await createTestUser()).id;
    const [a, b] = await twoProducts();
    const listId = await priceListId();

    const order = await orderDomain.createAdminOrder(userId, {
      user_id: userId,
      payment_method: 'manual',
      items: [
        { product_id: a, price_list_id: listId, quantity: 2 },
        { product_id: b, price_list_id: listId, quantity: 3 }
      ]
    });

    const lines = await query<{ product_id: string; quantity: number; subtotal: string }>(
      'SELECT product_id, quantity, subtotal FROM order_items WHERE order_id = $1',
      [order.id]
    );
    expect(lines.rows).toHaveLength(2);
    const sum = lines.rows.reduce((acc, l) => acc + Number(l.subtotal), 0);
    expect(Number(order.subtotal)).toBeCloseTo(sum, 2);
    expect(Number(order.total)).toBeCloseTo(Number(order.subtotal), 2);
  });

  it('lista de precios inexistente → PRICE_LIST_NOT_FOUND 404', async () => {
    const userId = (await createTestUser()).id;
    const [a] = await twoProducts();

    await expect(
      orderDomain.createAdminOrder(userId, {
        user_id: userId,
        items: [{ product_id: a, price_list_id: MISSING_UUID, quantity: 1 }]
      })
    ).rejects.toMatchObject({ code: 'PRICE_LIST_NOT_FOUND', statusCode: 404 });
  });

  it('producto inexistente → PRODUCT_NOT_FOUND 400', async () => {
    const userId = (await createTestUser()).id;
    const listId = await priceListId();

    await expect(
      orderDomain.createAdminOrder(userId, {
        user_id: userId,
        items: [{ product_id: MISSING_UUID, price_list_id: listId, quantity: 1 }]
      })
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', statusCode: 400 });
  });

  it('stock insuficiente → INSUFFICIENT_STOCK 409', async () => {
    const userId = (await createTestUser()).id;
    const [a] = await twoProducts();
    const listId = await priceListId();

    await expect(
      orderDomain.createAdminOrder(userId, {
        user_id: userId,
        items: [{ product_id: a, price_list_id: listId, quantity: 1_000_000 }]
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', statusCode: 409 });
  });
});
