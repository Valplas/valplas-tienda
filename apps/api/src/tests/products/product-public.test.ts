// apps/api/src/tests/products/product-public.test.ts
//
// El detalle público de producto (GET /api/products/slug/:slug) nunca debe
// exponer cost_price: el precio de venta se calcula en el server y viaja
// como `price` (tier de menor cantidad mínima, o costo si no hay lista).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { ProductWithDetails } from '../../modules/products/product.types.js';

vi.mock('../../modules/products/product.repository.js', () => ({
  findProductBySlug: vi.fn()
}));

import { toPublicProduct } from '../../modules/products/product.service.js';
import { getProductBySlug } from '../../modules/products/product.controller.js';
import * as productRepository from '../../modules/products/product.repository.js';

function buildProduct(overrides: Partial<ProductWithDetails> = {}): ProductWithDetails {
  return {
    id: 'prod-1',
    sku: 'LAP-001',
    name: 'Lapicera',
    slug: 'lapicera',
    description: null,
    categoryId: 'cat-1',
    categoryName: 'Librería',
    brandId: null,
    brandName: null,
    costPrice: 100,
    stock: 10,
    reservedStock: 0,
    availableStock: 10,
    isFeatured: false,
    isActive: true,
    images: [],
    priceTiers: [],
    ...overrides
  } as unknown as ProductWithDetails;
}

describe('toPublicProduct', () => {
  it('no incluye costPrice', () => {
    const result = toPublicProduct(buildProduct());

    expect(result).not.toHaveProperty('costPrice');
  });

  it('price = tier de menor minQuantity aunque los tiers vengan ordenados por nombre', () => {
    const result = toPublicProduct(
      buildProduct({
        priceTiers: [
          { priceListId: 'pl-a', priceListName: 'A Mayorista', minQuantity: 10, unitPrice: 130 },
          { priceListId: 'pl-b', priceListName: 'B Minorista', minQuantity: 1, unitPrice: 150 }
        ]
      })
    );

    expect(result.price).toBe(150);
  });

  it('price cae a costPrice cuando el producto no tiene lista asignada', () => {
    const result = toPublicProduct(buildProduct({ costPrice: 100, priceTiers: [] }));

    expect(result.price).toBe(100);
  });
});

describe('getProductBySlug controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responde el producto sin costPrice y con price', async () => {
    vi.mocked(productRepository.findProductBySlug).mockResolvedValue(
      buildProduct({
        priceTiers: [
          { priceListId: 'pl-b', priceListName: 'Minorista', minQuantity: 1, unitPrice: 150 }
        ]
      })
    );
    const res = { json: vi.fn() } as unknown as Response;
    const req = { params: { slug: 'lapicera' } } as unknown as Request;
    const next: NextFunction = vi.fn();

    await getProductBySlug(req, res, next);

    const body = vi.mocked(res.json).mock.calls[0][0];
    expect(body.data.product).not.toHaveProperty('costPrice');
    expect(body.data.product.price).toBe(150);
    expect(next).not.toHaveBeenCalled();
  });
});
