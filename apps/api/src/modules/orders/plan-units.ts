export interface PlannablePresentation {
  priceListId: string;
  bundleSize: number;
  bundlePrice: number;
}

export type UnitsPlan =
  | {
      ok: true;
      lines: Array<{ priceListId: string; bundleSize: number; quantity: number }>;
      total: number;
    }
  | { ok: false; nearestBelow: number | null; nearestAbove: number | null };

export const MAX_PLAN_UNITS = 100_000;

/**
 * Cheapest exact combination of presentations (unbounded knapsack) covering
 * exactly `units` base units. Costs are integer cents; ties go to fewer bundles.
 * When `units` is unreachable, reports the nearest reachable totals.
 */
export function planUnits(units: number, presentations: PlannablePresentation[]): UnitsPlan {
  if (!Number.isInteger(units) || units < 1 || units > MAX_PLAN_UNITS) {
    throw new RangeError(`units must be an integer between 1 and ${MAX_PLAN_UNITS}`);
  }

  // Keep the cheapest presentation per valid bundle size.
  const bySize = new Map<number, { p: PlannablePresentation; cents: number }>();
  for (const p of presentations) {
    if (!Number.isInteger(p.bundleSize) || p.bundleSize < 1 || !Number.isFinite(p.bundlePrice)) {
      continue;
    }
    const cents = Math.round(p.bundlePrice * 100);
    const current = bySize.get(p.bundleSize);
    if (!current || cents < current.cents) bySize.set(p.bundleSize, { p, cents });
  }
  const options = [...bySize.values()];
  if (options.length === 0) return { ok: false, nearestBelow: null, nearestAbove: null };

  const sizes = Int32Array.from(options.map((o) => o.p.bundleSize));
  const prices = Float64Array.from(options.map((o) => o.cents));
  const maxSize = Math.max(...sizes);
  const limit = units + maxSize;

  const cost = new Float64Array(limit + 1).fill(Infinity);
  const count = new Int32Array(limit + 1);
  const choice = new Int32Array(limit + 1).fill(-1);
  cost[0] = 0;

  for (let u = 1; u <= limit; u++) {
    let bestCost = Infinity;
    let bestCount = 0;
    let bestChoice = -1;
    for (let i = 0; i < sizes.length; i++) {
      const prev = u - sizes[i];
      if (prev < 0 || cost[prev] === Infinity) continue;
      const c = cost[prev] + prices[i];
      const n = count[prev] + 1;
      if (c < bestCost || (c === bestCost && n < bestCount)) {
        bestCost = c;
        bestCount = n;
        bestChoice = i;
      }
    }
    cost[u] = bestCost;
    count[u] = bestCount;
    choice[u] = bestChoice;
  }

  if (cost[units] === Infinity) {
    let nearestBelow: number | null = null;
    for (let u = units - 1; u >= 1; u--) {
      if (cost[u] !== Infinity) {
        nearestBelow = u;
        break;
      }
    }
    let nearestAbove: number | null = null;
    for (let u = units + 1; u <= limit; u++) {
      if (cost[u] !== Infinity) {
        nearestAbove = u;
        break;
      }
    }
    return { ok: false, nearestBelow, nearestAbove };
  }

  const quantities = new Map<number, number>();
  for (let u = units; u > 0; u -= sizes[choice[u]]) {
    quantities.set(choice[u], (quantities.get(choice[u]) ?? 0) + 1);
  }
  const lines = [...quantities.entries()]
    .map(([i, quantity]) => ({
      priceListId: options[i].p.priceListId,
      bundleSize: sizes[i],
      quantity
    }))
    .sort((a, b) => b.bundleSize - a.bundleSize);

  return { ok: true, lines, total: cost[units] / 100 };
}
