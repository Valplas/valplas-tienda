// apps/api/src/tests/orders/order-pricing.test.ts
//
// Un pedido puede traer varias líneas del mismo producto (una por presentación, como el
// carrito). El stock se controla sumando las unidades reales de todas esas líneas.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/products/product.repository.js', () => ({
  findProductsByIds: vi.fn()
}));

vi.mock('../../modules/cart/cart.repository.js', () => ({
  getTiersForCartItems: vi.fn()
}));

import { priceOrderItems } from '../../modules/orders/order-pricing.js';
import { findProductsByIds } from '../../modules/products/product.repository.js';
import { getTiersForCartItems } from '../../modules/cart/cart.repository.js';
import type { ProductWithDetails } from '../../modules/products/product.types.js';

function mockProduct(stock: number) {
  vi.mocked(findProductsByIds).mockResolvedValue([
    {
      id: 'prod-1',
      name: 'Bolsa',
      sku: 'BOL-1',
      isActive: true,
      stock,
      reservedStock: 0,
      costPrice: 50
    } as unknown as ProductWithDetails
  ]);
}

const items = [
  { product_id: 'prod-1', quantity: 1, price_list_id: 'pl-unit' },
  { product_id: 'prod-1', quantity: 3, price_list_id: 'pl-10' }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTiersForCartItems).mockResolvedValue(
    new Map([
      ['prod-1:pl-unit', { minQuantity: 1, unitPrice: 100 }],
      ['prod-1:pl-10', { minQuantity: 10, unitPrice: 80 }]
    ])
  );
});

describe('priceOrderItems: stock con varias líneas del mismo producto', () => {
  it('reporta INSUFFICIENT_STOCK cuando la suma de líneas supera el stock', async () => {
    // 1 u. + 3 bultos x10 = 31 u. > 30 disponibles (cada línea sola entra)
    mockProduct(30);

    const result = await priceOrderItems(items);

    expect(result.problems).toEqual([
      expect.objectContaining({ code: 'INSUFFICIENT_STOCK', product_id: 'prod-1', requested: 31 })
    ]);
  });

  it('sin problemas cuando la suma entra justo en el stock', async () => {
    mockProduct(31);

    const result = await priceOrderItems(items);

    expect(result.problems).toEqual([]);
    expect(result.lines.map((l) => l.real_quantity)).toEqual([1, 30]);
    expect(result.subtotal).toBe(100 + 2400);
  });
});
