import { describe, it, expect } from 'vitest';
import {
  formatArs,
  pluralizeUnit,
  describePresentations,
  describeLineTier,
  productSummary,
  presentationSnapshot,
  type SalesUnit,
  type TierForDisplay
} from '../../modules/catalog/presentation.js';

describe('formatArs', () => {
  it('formats with thousands dot and decimal comma', () => {
    expect(formatArs(46980)).toBe('$46.980');
    expect(formatArs(5872.5)).toBe('$5.872,50');
    expect(formatArs(0)).toBe('$0');
    expect(formatArs(1234567.89)).toBe('$1.234.567,89');
    expect(formatArs(999)).toBe('$999');
  });
});

describe('pluralizeUnit', () => {
  it('pluralizes by ending', () => {
    expect(pluralizeUnit('paquete', 10)).toBe('paquetes');
    expect(pluralizeUnit('unidad', 2)).toBe('unidades');
    expect(pluralizeUnit('kg', 5)).toBe('kg');
    expect(pluralizeUnit('rollo', 1)).toBe('rollo');
  });
});

const unit: SalesUnit = { label: 'paquete', contentQuantity: 100, contentLabel: 'bolsas' };
const noUnit: SalesUnit = { label: null, contentQuantity: null, contentLabel: null };

describe('describePresentations', () => {
  it('describes tiers with unit and labels', () => {
    const tiers: TierForDisplay[] = [
      { priceListId: 'b', minQuantity: 10, unitPrice: 4698, label: 'Bulto' },
      { priceListId: 'a', minQuantity: 1, unitPrice: 5872.5, label: 'Paquete' }
    ];
    // unitPrice es por unidad base; bundlePrice = computeBundlePrice
    const views = describePresentations(unit, tiers);
    expect(views.map((v) => v.bundleSize)).toEqual([1, 10]);
    expect(views[0].description).toBe('Paquete de 100 bolsas: $5.872,50');
    expect(views[1].description).toBe(
      'Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)'
    );
    expect(views.map((v) => v.savingsPercent)).toEqual([0, 20]);
    expect(views[0].contains).toBe('100 bolsas');
    expect(views[1].contains).toBe('10 paquetes (1.000 bolsas)');
  });

  it('works without unit and labels', () => {
    const views = describePresentations(noUnit, [
      { priceListId: 'a', minQuantity: 1, unitPrice: 5872.5, label: null },
      { priceListId: 'b', minQuantity: 10, unitPrice: 4698, label: null }
    ]);
    expect(views.map((v) => v.label)).toEqual(['Unidad', 'Bulto x10']);
    expect(views[0].description).toBe('Unidad: $5.872,50');
    expect(views[1].description).toBe('Bulto x10: $46.980 ($4.698 c/u, 20% menos)');
    expect(views[0].contains).toBeNull();
    expect(views[1].contains).toBeNull();
  });

  it('producto con solo un tier de 10: no lo trata como base y coincide con describeLineTier', () => {
    const only10: TierForDisplay[] = [
      { priceListId: 'a', minQuantity: 10, unitPrice: 4698, label: null }
    ];
    const [view] = describePresentations(unit, only10);
    expect(view.label).toBe('Bulto');
    expect(view.contains).toBe('10 paquetes (1.000 bolsas)');
    expect(view.description).toBe(
      'Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete)'
    );
    expect(view.description).toBe(describeLineTier(unit, only10[0]).description);
    const line = describeLineTier(unit, only10[0]);
    expect(line.label).toBe(view.label);
    expect(line.contains).toBe(view.contains);

    const [noUnitView] = describePresentations(noUnit, only10);
    expect(noUnitView.label).toBe('Bulto x10');
    expect(noUnitView.contains).toBeNull();
    expect(describeLineTier(noUnit, only10[0]).label).toBe('Bulto x10');
  });

  it('capitalizes unit label as fallback label', () => {
    const views = describePresentations(
      { label: 'rollo', contentQuantity: null, contentLabel: null },
      [{ priceListId: 'a', minQuantity: 1, unitPrice: 100, label: null }]
    );
    expect(views[0].label).toBe('Rollo');
  });

  it('omits savings text when no savings and formats decimal content', () => {
    const views = describePresentations(
      { label: 'bolsa', contentQuantity: 0.5, contentLabel: 'kg' },
      [
        { priceListId: 'a', minQuantity: 1, unitPrice: 100, label: null },
        { priceListId: 'b', minQuantity: 3, unitPrice: 100, label: null }
      ]
    );
    expect(views[0].contains).toBe('0,5 kg');
    expect(views[1].contains).toBe('3 bolsas (1,5 kg)');
    expect(views[1].savingsPercent).toBe(0);
    expect(views[1].description).toBe('Bulto de 3 bolsas (1,5 kg): $300 ($100 c/bolsa)');
  });
});

describe('productSummary', () => {
  it('joins descriptions or returns null', () => {
    const views = describePresentations(noUnit, [
      { priceListId: 'a', minQuantity: 1, unitPrice: 5872.5, label: null },
      { priceListId: 'b', minQuantity: 10, unitPrice: 4698, label: null }
    ]);
    const s = productSummary('Bolsa', views);
    expect(s?.startsWith('Bolsa viene en: ')).toBe(true);
    expect(s).toBe(`Bolsa viene en: ${views[0].description}; ${views[1].description}`);
    expect(productSummary('Bolsa', [])).toBeNull();
  });
});

describe('presentationSnapshot', () => {
  it('uses label and contains', () => {
    const t: TierForDisplay[] = [
      { priceListId: 'a', minQuantity: 1, unitPrice: 5872.5, label: 'Paquete' },
      { priceListId: 'b', minQuantity: 10, unitPrice: 4698, label: 'Bulto' }
    ];
    expect(presentationSnapshot(describePresentations(unit, t)[1])).toBe(
      'Bulto · 10 paquetes (1.000 bolsas)'
    );
    const t2: TierForDisplay[] = [
      { priceListId: 'a', minQuantity: 1, unitPrice: 5872.5, label: null },
      { priceListId: 'b', minQuantity: 10, unitPrice: 4698, label: null }
    ];
    expect(presentationSnapshot(describePresentations(noUnit, t2)[1])).toBe('Bulto x10');
  });
});
