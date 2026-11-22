import { describe, it, expect } from 'vitest';
import {
  computePackages,
  channelFor,
  pickContract,
  MAX_BULTOS
} from '../../modules/shipments/packages.js';
import type { PackageLine } from '../../modules/shipments/shipment.types.js';

const defaults = { itemWeightKg: 1, itemVolumeCm3: 1000 };

function line(over: Partial<PackageLine> = {}): PackageLine {
  return {
    productId: 'p1',
    productName: 'Balde',
    realQuantity: 1,
    weightKg: 1,
    widthCm: 10,
    lengthCm: 10,
    heightCm: 10,
    ...over
  };
}

describe('computePackages', () => {
  it('uses product weight x realQuantity', () => {
    const r = computePackages(
      [
        line({ productId: 'a', weightKg: 1.2, realQuantity: 3 }),
        line({ productId: 'b', weightKg: 0.5, realQuantity: 2 })
      ],
      1000,
      defaults
    );
    expect(r.totalKg).toBe(4.6);
  });

  it('volume uses l x w x h when all dims present else default', () => {
    const r = computePackages(
      [
        line({ lengthCm: 10, widthCm: 20, heightCm: 30, realQuantity: 2 }),
        line({ productId: 'b', lengthCm: null, realQuantity: 1 })
      ],
      100,
      defaults
    );
    expect(r.totalVolumeCm3).toBe(13000);
  });

  it('warns per product missing weight or dims', () => {
    const r = computePackages(
      [
        line({ productName: 'SinPeso', weightKg: null }),
        line({ productId: 'b', productName: 'SinMedidas', widthCm: null }),
        line({ productId: 'c', productName: 'Completo' })
      ],
      100,
      defaults
    );
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings.join('|')).toContain('SinPeso');
    expect(r.warnings.join('|')).toContain('SinMedidas');
    expect(r.warnings.join('|')).not.toContain('Completo');
  });

  it('single package B2C when <= 50 kg', () => {
    const r = computePackages([line({ weightKg: 10, realQuantity: 5 })], 500, defaults);
    expect(r.packages).toHaveLength(1);
    expect(r.packages[0].kilos).toBe(50);
    expect(r.packages[0].declaredValue).toBe(500);
    expect(r.channel).toBe('B2C');
  });

  it('splits into ceil(kg/50) equal packages and B2B when > 50 kg', () => {
    const r = computePackages([line({ weightKg: 10, realQuantity: 12 })], 1000, defaults);
    expect(r.packages).toHaveLength(3);
    for (const p of r.packages) {
      expect(p.kilos).toBe(40);
      expect(p.volumeCm3).toBe(4000);
    }
    const sum = r.packages.reduce((s, p) => s + p.declaredValue, 0);
    expect(Math.abs(sum - 1000)).toBeLessThanOrEqual(0.01);
    expect(r.channel).toBe('B2B');
  });

  it('declared value split sums to subtotal when not evenly divisible', () => {
    const r = computePackages([line({ weightKg: 10, realQuantity: 12 })], 100, defaults);
    const sum = r.packages.reduce((s, p) => s + p.declaredValue, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });

  it('throws ANDREANI_TOO_MANY_BULTOS above 300 bultos', () => {
    expect(() =>
      computePackages([line({ weightKg: 50, realQuantity: MAX_BULTOS + 1 })], 1, defaults)
    ).toThrowError(expect.objectContaining({ code: 'ANDREANI_TOO_MANY_BULTOS' }));
  });

  it('zero lines throws SHIPMENT_NO_ITEMS', () => {
    expect(() => computePackages([], 0, defaults)).toThrowError(
      expect.objectContaining({ code: 'SHIPMENT_NO_ITEMS' })
    );
  });
});

describe('channelFor', () => {
  it('B2B when more than one package, B2C otherwise', () => {
    const p = { kilos: 10, volumeCm3: 1, declaredValue: 1 };
    expect(channelFor([p])).toBe('B2C');
    expect(channelFor([p, p])).toBe('B2B');
  });
});

describe('pickContract', () => {
  const contracts = { home: 'H', branch: 'S', b2b: 'B' };
  it('home B2C -> contracts.home', () => {
    expect(pickContract('home_delivery', 'B2C', contracts)).toBe('H');
  });
  it('branch B2C -> contracts.branch', () => {
    expect(pickContract('branch_pickup', 'B2C', contracts)).toBe('S');
  });
  it('B2B home -> contracts.b2b', () => {
    expect(pickContract('home_delivery', 'B2B', contracts)).toBe('B');
  });
  it('B2B branch -> ANDREANI_B2B_BRANCH_UNSUPPORTED', () => {
    expect(() => pickContract('branch_pickup', 'B2B', contracts)).toThrowError(
      expect.objectContaining({ code: 'ANDREANI_B2B_BRANCH_UNSUPPORTED', statusCode: 422 })
    );
  });
  it('B2B without b2b contract -> ANDREANI_B2B_NOT_CONFIGURED', () => {
    expect(() => pickContract('home_delivery', 'B2B', { ...contracts, b2b: '' })).toThrowError(
      expect.objectContaining({ code: 'ANDREANI_B2B_NOT_CONFIGURED' })
    );
  });
  it('branch without contract -> ANDREANI_BRANCH_NOT_CONFIGURED', () => {
    expect(() => pickContract('branch_pickup', 'B2C', { ...contracts, branch: '' })).toThrowError(
      expect.objectContaining({ code: 'ANDREANI_BRANCH_NOT_CONFIGURED' })
    );
  });
});
