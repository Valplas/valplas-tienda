// apps/api/src/tests/cart/cart.service.test.ts
//
// El carrito guarda una línea por (producto, presentación). Cada presentación es un tier
// (lista de precios + tamaño de bulto) y `quantity` cuenta bultos de ESA presentación.
// El stock se controla en unidades reales sumando todas las líneas del mismo producto.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/cart/cart.repository.js', () => ({
  getTiersForCartItems: vi.fn(),
  getProductForCart: vi.fn(),
  getProductsForCart: vi.fn(),
  getAvailableStock: vi.fn()
}));

import {
  addToCart,
  updateCartItem,
  removeFromCart,
  getCartWithDetails
} from '../../modules/cart/cart.service.js';
import * as cartRepository from '../../modules/cart/cart.repository.js';
import type { TierInfo } from '../../modules/cart/cart.repository.js';
import type { Cart } from '../../modules/cart/cart.types.js';

const PRODUCT_ID = 'prod-1';

// Presentaciones del producto: unidad (lista minorista) y bulto x10 (lista mayorista)
const TIERS: Record<string, TierInfo> = {
  [`${PRODUCT_ID}:pl-unit`]: { minQuantity: 1, unitPrice: 100 },
  [`${PRODUCT_ID}:pl-10`]: { minQuantity: 10, unitPrice: 80 }
};

function mockStock(availableStock: number) {
  const product = {
    id: PRODUCT_ID,
    name: 'Bolsa',
    slug: 'bolsa',
    sku: 'BOL-1',
    price: 100,
    imageUrl: null,
    availableStock
  };
  vi.mocked(cartRepository.getProductForCart).mockResolvedValue(product);
  vi.mocked(cartRepository.getProductsForCart).mockResolvedValue([product]);
  vi.mocked(cartRepository.getAvailableStock).mockResolvedValue(availableStock);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cartRepository.getTiersForCartItems).mockImplementation(async (items) => {
    const map = new Map<string, TierInfo>();
    for (const item of items) {
      const key = `${item.productId}:${item.priceListId}`;
      if (TIERS[key]) map.set(key, TIERS[key]);
    }
    return map;
  });
});

describe('addToCart', () => {
  it('misma presentación suma bultos en la misma línea', async () => {
    mockStock(100);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 2, priceListId: 'pl-10' }] };

    const result = await addToCart(cart, {
      productId: PRODUCT_ID,
      quantity: 1,
      priceListId: 'pl-10'
    });

    expect(result.cart.items).toEqual([
      { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
    ]);
  });

  it('otra presentación del mismo producto crea una línea separada', async () => {
    mockStock(100);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' }] };

    const result = await addToCart(cart, {
      productId: PRODUCT_ID,
      quantity: 3,
      priceListId: 'pl-10'
    });

    expect(result.cart.items).toEqual([
      { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' },
      { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
    ]);
  });

  it('valida stock sumando las unidades de todas las líneas del producto', async () => {
    // 1 u. ya en carrito + 3 bultos x10 = 31 u. > 30 disponibles
    mockStock(30);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' }] };

    await expect(
      addToCart(cart, { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      message: expect.stringContaining('2')
    });
  });

  it('acepta cuando el total de unidades entra justo en el stock', async () => {
    mockStock(31);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' }] };

    const result = await addToCart(cart, {
      productId: PRODUCT_ID,
      quantity: 3,
      priceListId: 'pl-10'
    });

    expect(result.cart.items).toHaveLength(2);
  });

  it('producto sin lista: suma unidades en la línea sin priceListId', async () => {
    mockStock(100);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 2 }] };

    const result = await addToCart(cart, { productId: PRODUCT_ID, quantity: 1 });

    expect(result.cart.items).toEqual([{ productId: PRODUCT_ID, quantity: 3 }]);
  });

  it('rechaza una lista que no es tier activo del producto', async () => {
    mockStock(100);

    await expect(
      addToCart({ items: [] }, { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-otra' })
    ).rejects.toMatchObject({ code: 'TIER_NOT_FOUND' });
  });
});

describe('updateCartItem', () => {
  const twoLines = (): Cart => ({
    items: [
      { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' },
      { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
    ]
  });

  it('actualiza solo la línea de la presentación indicada', async () => {
    mockStock(100);

    const result = await updateCartItem(twoLines(), PRODUCT_ID, {
      quantity: 5,
      priceListId: 'pl-unit'
    });

    expect(result.cart.items).toEqual([
      { productId: PRODUCT_ID, quantity: 5, priceListId: 'pl-unit' },
      { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
    ]);
  });

  it('valida stock contando las otras líneas del producto', async () => {
    // 5 u. + 3 bultos x10 = 35 u. > 34 disponibles
    mockStock(34);

    await expect(
      updateCartItem(twoLines(), PRODUCT_ID, { quantity: 5, priceListId: 'pl-unit' })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('sin priceListId usa la única línea del producto (compatibilidad)', async () => {
    mockStock(100);
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }] };

    const result = await updateCartItem(cart, PRODUCT_ID, { quantity: 2 });

    expect(result.cart.items).toEqual([
      { productId: PRODUCT_ID, quantity: 2, priceListId: 'pl-10' }
    ]);
  });

  it('sin priceListId y con varias líneas del producto responde 404', async () => {
    mockStock(100);

    await expect(updateCartItem(twoLines(), PRODUCT_ID, { quantity: 2 })).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND'
    });
  });
});

describe('removeFromCart', () => {
  it('elimina solo la línea de la presentación indicada', () => {
    const cart: Cart = {
      items: [
        { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' },
        { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
      ]
    };

    const result = removeFromCart(cart, PRODUCT_ID, 'pl-10');

    expect(result.cart.items).toEqual([
      { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' }
    ]);
  });

  it('sin priceListId elimina la única línea del producto (compatibilidad)', () => {
    const cart: Cart = { items: [{ productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }] };

    const result = removeFromCart(cart, PRODUCT_ID);

    expect(result.cart.items).toEqual([]);
  });
});

describe('getCartWithDetails', () => {
  it('reparte el stock entre las líneas del mismo producto', async () => {
    // 30 u. disponibles: la línea unitaria usa 1, quedan 29 → caben 2 bultos x10 (no 3)
    mockStock(30);
    const cart: Cart = {
      items: [
        { productId: PRODUCT_ID, quantity: 1, priceListId: 'pl-unit' },
        { productId: PRODUCT_ID, quantity: 3, priceListId: 'pl-10' }
      ]
    };

    const summary = await getCartWithDetails(cart);

    expect(summary.items).toHaveLength(2);
    expect(summary.items[0]).toMatchObject({
      priceListId: 'pl-unit',
      quantity: 1,
      minQuantity: 1,
      pricePerBundle: 100
    });
    expect(summary.items[1]).toMatchObject({
      priceListId: 'pl-10',
      quantity: 2,
      minQuantity: 10,
      unitPrice: 80,
      pricePerBundle: 800,
      subtotal: 1600
    });
    expect(summary.subtotal).toBe(1700);
  });
});
