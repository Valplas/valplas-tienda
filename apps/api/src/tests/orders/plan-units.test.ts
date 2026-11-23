import { describe, it, expect } from 'vitest';
import {
  planUnits,
  MAX_PLAN_UNITS,
  type PlannablePresentation
} from '../../modules/orders/plan-units.js';

const p = (
  priceListId: string,
  bundleSize: number,
  bundlePrice: number
): PlannablePresentation => ({
  priceListId,
  bundleSize,
  bundlePrice
});

describe('planUnits', () => {
  it('mixes a bundle of 10 with loose units for 12', () => {
    const r = planUnits(12, [p('u', 1, 5872.5), p('b', 10, 46980)]);
    expect(r).toEqual({
      ok: true,
      lines: [
        { priceListId: 'b', bundleSize: 10, quantity: 1 },
        { priceListId: 'u', bundleSize: 1, quantity: 2 }
      ],
      total: 58725
    });
  });

  it('picks the only exact combination (2x6) over unreachable ones', () => {
    const r = planUnits(12, [p('s6', 6, 600), p('s10', 10, 1100)]);
    expect(r).toEqual({
      ok: true,
      lines: [{ priceListId: 's6', bundleSize: 6, quantity: 2 }],
      total: 1200
    });
  });

  it('reports nearest reachable totals when units are not reachable', () => {
    expect(planUnits(12, [p('b', 10, 100)])).toEqual({
      ok: false,
      nearestBelow: 10,
      nearestAbove: 20
    });
    expect(planUnits(5, [p('b', 10, 100)])).toEqual({
      ok: false,
      nearestBelow: null,
      nearestAbove: 10
    });
  });

  it('breaks cost ties with fewer total bundles', () => {
    const r = planUnits(4, [p('a', 1, 1), p('b', 2, 2)]);
    expect(r).toEqual({
      ok: true,
      lines: [{ priceListId: 'b', bundleSize: 2, quantity: 2 }],
      total: 4
    });
  });

  it('orders lines by bundleSize desc with no zero quantities', () => {
    const r = planUnits(16, [p('a', 1, 10), p('c', 5, 40), p('b', 3, 25), p('d', 7, 1000)]);
    if (!r.ok) throw new Error('expected ok');
    const sizes = r.lines.map((l) => l.bundleSize);
    expect([...sizes].sort((x, y) => y - x)).toEqual(sizes);
    expect(r.lines.every((l) => l.quantity > 0)).toBe(true);
    expect(r.lines.reduce((s, l) => s + l.bundleSize * l.quantity, 0)).toBe(16);
  });

  it('keeps the cheapest of duplicated bundle sizes and ignores invalid ones', () => {
    const r = planUnits(2, [p('x', 1, 9), p('y', 1, 5), p('z', 0, 1), p('n', 1, NaN)]);
    expect(r).toEqual({
      ok: true,
      lines: [{ priceListId: 'y', bundleSize: 1, quantity: 2 }],
      total: 10
    });
  });

  it('returns unreachable with nulls when no valid presentation', () => {
    expect(planUnits(3, [])).toEqual({ ok: false, nearestBelow: null, nearestAbove: null });
  });

  it('throws RangeError for invalid units', () => {
    expect(() => planUnits(0, [p('a', 1, 1)])).toThrow(RangeError);
    expect(() => planUnits(1.5, [p('a', 1, 1)])).toThrow(RangeError);
    expect(() => planUnits(MAX_PLAN_UNITS + 1, [p('a', 1, 1)])).toThrow(RangeError);
  });

  it('handles MAX_PLAN_UNITS quickly', () => {
    const t = Date.now();
    const r = planUnits(MAX_PLAN_UNITS, [p('u', 1, 10), p('b', 10, 90)]);
    expect(Date.now() - t).toBeLessThan(500);
    expect(r).toEqual({
      ok: true,
      lines: [{ priceListId: 'b', bundleSize: 10, quantity: 10_000 }],
      total: 900_000
    });
  });
});
