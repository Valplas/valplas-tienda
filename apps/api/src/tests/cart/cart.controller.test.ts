// apps/api/src/tests/cart/cart.controller.test.ts
//
// GET /api/cart reescribe la cookie cuando el carrito cambió (productos eliminados o
// cantidades recortadas por stock). Esa reescritura NO puede perder la presentación
// (priceListId): sin ella, 3 bultos x10 pasan a ser 3 unidades a precio unitario.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../modules/cart/cart.service.js', () => ({
  getCartFromCookie: vi.fn(),
  getCartWithDetails: vi.fn(),
  saveCartToCookie: vi.fn()
}));

import { getCart } from '../../modules/cart/cart.controller.js';
import * as cartService from '../../modules/cart/cart.service.js';
import type { CartItemWithProduct, CartSummary } from '../../modules/cart/cart.types.js';

function detailItem(overrides: Partial<CartItemWithProduct>): CartItemWithProduct {
  return {
    productId: 'prod-1',
    quantity: 1,
    name: 'Bolsa',
    slug: 'bolsa',
    sku: 'BOL-1',
    price: 100,
    imageUrl: null,
    availableStock: 100,
    minQuantity: 1,
    unitPrice: 100,
    pricePerBundle: 100,
    subtotal: 100,
    ...overrides
  };
}

function summary(items: CartItemWithProduct[]): CartSummary {
  return { items, subtotal: 0, itemCount: 0, totalItems: items.length };
}

const req = {} as Request;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCart controller', () => {
  it('no reescribe la cookie si el carrito no cambió (con presentaciones)', async () => {
    vi.mocked(cartService.getCartFromCookie).mockReturnValue({
      items: [{ productId: 'prod-1', quantity: 3, priceListId: 'pl-10' }]
    });
    vi.mocked(cartService.getCartWithDetails).mockResolvedValue(
      summary([detailItem({ quantity: 3, priceListId: 'pl-10', minQuantity: 10 })])
    );
    const res = { json: vi.fn() } as unknown as Response;
    const next: NextFunction = vi.fn();

    await getCart(req, res, next);

    expect(cartService.saveCartToCookie).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('al recortar cantidades conserva el priceListId de cada línea', async () => {
    vi.mocked(cartService.getCartFromCookie).mockReturnValue({
      items: [
        { productId: 'prod-1', quantity: 1, priceListId: 'pl-unit' },
        { productId: 'prod-1', quantity: 3, priceListId: 'pl-10' }
      ]
    });
    vi.mocked(cartService.getCartWithDetails).mockResolvedValue(
      summary([
        detailItem({ quantity: 1, priceListId: 'pl-unit' }),
        detailItem({ quantity: 2, priceListId: 'pl-10', minQuantity: 10 })
      ])
    );
    const res = { json: vi.fn() } as unknown as Response;
    const next: NextFunction = vi.fn();

    await getCart(req, res, next);

    expect(cartService.saveCartToCookie).toHaveBeenCalledWith(res, {
      items: [
        { productId: 'prod-1', quantity: 1, priceListId: 'pl-unit' },
        { productId: 'prod-1', quantity: 2, priceListId: 'pl-10' }
      ]
    });
  });
});
