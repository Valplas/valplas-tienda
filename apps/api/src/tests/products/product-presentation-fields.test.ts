// Campos de unidad de venta (producto) y nombre de presentación (tier) — admin API.

import { describe, it, expect } from 'vitest';
import { createTestProduct } from '../helpers.js';
import {
  updateProductSchema,
  createProductSchema
} from '../../modules/products/product.validator.js';
import { replaceProductTiersSchema } from '../../modules/products/price-tiers/price-tier.validator.js';
import * as productService from '../../modules/products/product.service.js';
import * as tierRepository from '../../modules/products/price-tiers/price-tier.repository.js';

describe('validators de unidad y presentación', () => {
  it('acepta los 3 campos de unidad completos', () => {
    const r = updateProductSchema.safeParse({
      unitLabel: 'paquete',
      unitContentQuantity: 100,
      unitContentLabel: 'bolsas'
    });
    expect(r.success).toBe(true);
  });

  it('rechaza unitContentQuantity sin unitContentLabel', () => {
    const r = updateProductSchema.safeParse({ unitContentQuantity: 100 });
    expect(r.success).toBe(false);
  });

  it('rechaza unitContentLabel sin unitContentQuantity', () => {
    const r = updateProductSchema.safeParse({ unitContentLabel: 'bolsas' });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidad de contenido <= 0', () => {
    const r = updateProductSchema.safeParse({ unitContentQuantity: 0, unitContentLabel: 'bolsas' });
    expect(r.success).toBe(false);
  });

  it("convierte '' en null", () => {
    const r = updateProductSchema.parse({
      unitLabel: '',
      unitContentQuantity: null,
      unitContentLabel: ''
    });
    expect(r.unitLabel).toBeNull();
    expect(r.unitContentLabel).toBeNull();
  });

  it('create acepta unidad opcional', () => {
    const r = createProductSchema.safeParse({
      sku: 'VITEST-X',
      name: 'x',
      slug: 'x',
      categoryId: '00000000-0000-4000-8000-000000000000',
      costPrice: 1,
      unitLabel: 'paquete',
      unitContentQuantity: 10,
      unitContentLabel: 'bolsas'
    });
    expect(r.success).toBe(true);
  });

  it("tier: label '' pasa a null, 'Bulto' se conserva, >40 chars falla", () => {
    const base = { priceListId: '00000000-0000-4000-8000-000000000000', minQuantity: 1 };
    expect(
      replaceProductTiersSchema.parse({ tiers: [{ ...base, label: '' }] }).tiers[0].label
    ).toBeNull();
    expect(
      replaceProductTiersSchema.parse({ tiers: [{ ...base, label: 'Bulto' }] }).tiers[0].label
    ).toBe('Bulto');
    expect(
      replaceProductTiersSchema.safeParse({ tiers: [{ ...base, label: 'x'.repeat(41) }] }).success
    ).toBe(false);
  });
});

describe('persistencia de unidad y presentación', () => {
  it('updateProduct guarda los 3 campos y el detalle admin los devuelve', async () => {
    const p = await createTestProduct();
    const updated = await productService.updateProduct(p.id, {
      unitLabel: 'paquete',
      unitContentQuantity: 100,
      unitContentLabel: 'bolsas'
    });
    expect(updated.unitLabel).toBe('paquete');
    expect(updated.unitContentQuantity).toBe(100);
    expect(updated.unitContentLabel).toBe('bolsas');
  });

  it('null limpia los campos de unidad', async () => {
    const p = await createTestProduct({
      unit: { label: 'paquete', contentQuantity: 10, contentLabel: 'bolsas' }
    });
    const updated = await productService.updateProduct(p.id, {
      unitLabel: null,
      unitContentQuantity: null,
      unitContentLabel: null
    });
    expect(updated.unitLabel).toBeNull();
    expect(updated.unitContentQuantity).toBeNull();
    expect(updated.unitContentLabel).toBeNull();
  });

  it('replaceProductTiers guarda label y findTiersByProductId lo devuelve; sin label es null', async () => {
    const p = await createTestProduct({ tiers: [{ minQuantity: 1 }, { minQuantity: 10 }] });
    const [a, b] = p.priceListIds;
    const tiers = await tierRepository.replaceProductTiers(p.id, [
      { priceListId: a, minQuantity: 1 },
      { priceListId: b, minQuantity: 10, label: 'Bulto' }
    ]);
    expect(tiers.find((t) => t.minQuantity === 10)?.label).toBe('Bulto');
    expect(tiers.find((t) => t.minQuantity === 1)?.label).toBeNull();
    const detail = await productService.getProductById(p.id);
    expect(detail.priceTiers.find((t) => t.minQuantity === 10)?.label).toBe('Bulto');
  });

  it('createTestProduct inserta label de tier', async () => {
    const p = await createTestProduct({ tiers: [{ minQuantity: 5, label: 'Caja' }] });
    const tiers = await tierRepository.findTiersByProductId(p.id);
    expect(tiers[0].label).toBe('Caja');
  });
});
