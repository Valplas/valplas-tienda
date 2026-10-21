// apps/api/src/tests/banners/banner.validator.test.ts
//
// Los campos de un multipart llegan como string: el schema de alta tiene que
// convertir '' → null y 'true'/'false' → boolean, y el de edición distinguir
// "no tocar" (undefined) de "limpiar" (null).

import { describe, it, expect } from 'vitest';
import {
  createBannerSchema,
  updateBannerSchema,
  reorderBannersSchema
} from '../../modules/banners/banner.validator.js';

const CATEGORY_ID = '6f1c1c3e-6a6b-4b8e-9f3e-0d6d7f0f2a11';

describe('createBannerSchema', () => {
  it('aplica defaults cuando solo viene el nombre', () => {
    const result = createBannerSchema.parse({ title: 'Promo verano' });

    expect(result).toEqual({
      title: 'Promo verano',
      linkCategoryId: null,
      linkBrandId: null,
      linkProductId: null,
      isActive: true,
      startsAt: null,
      endsAt: null
    });
  });

  it('convierte strings de multipart: vacío → null, "false" → false', () => {
    const result = createBannerSchema.parse({
      title: '  Promo  ',
      link_category_id: CATEGORY_ID,
      link_brand_id: '',
      link_product_id: 'null',
      is_active: 'false',
      starts_at: '',
      ends_at: '2026-12-31T23:59:59-03:00'
    });

    expect(result.title).toBe('Promo');
    expect(result.linkCategoryId).toBe(CATEGORY_ID);
    expect(result.linkBrandId).toBeNull();
    expect(result.linkProductId).toBeNull();
    expect(result.isActive).toBe(false);
    expect(result.startsAt).toBeNull();
    expect(result.endsAt).toBe('2026-12-31T23:59:59-03:00');
  });

  it('rechaza un "hasta" anterior o igual al "desde"', () => {
    const result = createBannerSchema.safeParse({
      title: 'Promo',
      starts_at: '2026-12-01T00:00:00-03:00',
      ends_at: '2026-11-30T23:59:59-03:00'
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['ends_at']);
  });

  it('rechaza nombre vacío e ids que no son UUID', () => {
    expect(createBannerSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(
      createBannerSchema.safeParse({ title: 'Promo', link_brand_id: 'no-es-uuid' }).success
    ).toBe(false);
  });
});

describe('updateBannerSchema', () => {
  it('distingue "no tocar" (undefined) de "limpiar" (null)', () => {
    const result = updateBannerSchema.parse({ link_category_id: null, is_active: false });

    expect(result.linkCategoryId).toBeNull();
    expect(result.isActive).toBe(false);
    expect(result.title).toBeUndefined();
    expect(result.linkBrandId).toBeUndefined();
    expect(result.startsAt).toBeUndefined();
  });

  it('exige al menos un campo', () => {
    expect(updateBannerSchema.safeParse({}).success).toBe(false);
  });
});

describe('reorderBannersSchema', () => {
  it('exige una lista no vacía de UUIDs', () => {
    expect(reorderBannersSchema.safeParse({ banner_ids: [] }).success).toBe(false);
    expect(reorderBannersSchema.safeParse({ banner_ids: ['x'] }).success).toBe(false);
    expect(reorderBannersSchema.safeParse({ banner_ids: [CATEGORY_ID] }).success).toBe(true);
  });
});
