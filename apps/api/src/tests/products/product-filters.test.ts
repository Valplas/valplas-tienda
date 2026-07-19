// apps/api/src/tests/products/product-filters.test.ts
//
// El catálogo público manda filtros en snake_case (convención de requests)
// y el repositorio los lee en camelCase. El schema debe normalizar
// snake_case → camelCase y seguir aceptando camelCase (admin legacy).

import { describe, it, expect } from 'vitest';
import { productFiltersSchema } from '../../modules/products/product.validator.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('productFiltersSchema: normalización snake_case', () => {
  it('convierte category_id, brand_id, min_price, max_price e in_stock a camelCase', () => {
    const parsed = productFiltersSchema.parse({
      category_id: UUID,
      brand_id: UUID,
      min_price: '100',
      max_price: '500',
      in_stock: 'true'
    });

    expect(parsed.categoryId).toBe(UUID);
    expect(parsed.brandId).toBe(UUID);
    expect(parsed.minPrice).toBe(100);
    expect(parsed.maxPrice).toBe(500);
    expect(parsed.inStock).toBe(true);
  });

  it('sigue aceptando camelCase (admin legacy)', () => {
    const parsed = productFiltersSchema.parse({ categoryId: UUID, brandId: UUID });

    expect(parsed.categoryId).toBe(UUID);
    expect(parsed.brandId).toBe(UUID);
  });

  it('aplica defaults de paginación y sort con query vacío', () => {
    const parsed = productFiltersSchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(24);
    expect(parsed.sort).toBe('newest');
  });

  it('coerce de strings del query: page y limit numéricos', () => {
    const parsed = productFiltersSchema.parse({ page: '3', limit: '12' });

    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(12);
  });

  it('rechaza category_id que no es uuid', () => {
    const result = productFiltersSchema.safeParse({ category_id: 'no-es-uuid' });

    expect(result.success).toBe(false);
  });

  it('acepta los sorts del admin (stock y updated)', () => {
    for (const sort of ['stock_asc', 'stock_desc', 'updated_asc', 'updated_desc']) {
      expect(productFiltersSchema.safeParse({ sort }).success).toBe(true);
    }
  });

  it('rechaza sort desconocido', () => {
    expect(productFiltersSchema.safeParse({ sort: 'precio_asc' }).success).toBe(false);
  });
});
