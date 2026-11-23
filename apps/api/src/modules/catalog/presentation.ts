import { computeBundlePrice } from '../orders/order-pricing.js';

export interface SalesUnit {
  label: string | null;
  contentQuantity: number | null;
  contentLabel: string | null;
}

export interface TierForDisplay {
  priceListId: string;
  minQuantity: number;
  unitPrice: number;
  label: string | null;
}

export interface PresentationView {
  priceListId: string;
  bundleSize: number;
  unitPrice: number;
  bundlePrice: number;
  label: string;
  contains: string | null;
  savingsPercent: number;
  description: string;
}

const INVARIABLE_UNITS = new Set(['kg', 'g', 'm', 'mts', 'cm', 'mm', 'lt', 'l', 'ml', 'cc']);
const VOWELS = 'aeiouáéíóú';
const SNAPSHOT_MAX = 120;

/** Agrega separador de miles "." a una cadena de dígitos (sin depender de ICU). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `$46.980`, `$5.872,50`, `$0` (sin decimales si son ,00). */
export function formatArs(amount: number): string {
  const totalCents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const sign = amount < 0 && totalCents > 0 ? '-' : '';
  const decimals = cents === 0 ? '' : `,${String(cents).padStart(2, '0')}`;
  return `${sign}$${groupThousands(String(whole))}${decimals}`;
}

/** Número con punto de miles y coma decimal (hasta 3 decimales, NUMERIC(12,3)). */
function formatQuantity(value: number): string {
  const [whole, frac] = value.toFixed(3).split('.');
  let end = frac.length;
  while (end > 0 && frac[end - 1] === '0') end--;
  const decimals = frac.slice(0, end);
  return `${groupThousands(whole)}${decimals ? `,${decimals}` : ''}`;
}

export function pluralizeUnit(label: string, count: number): string {
  if (count === 1) return label;
  if (INVARIABLE_UNITS.has(label.toLowerCase())) return label;
  return VOWELS.includes(label.slice(-1).toLowerCase()) ? `${label}s` : `${label}es`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildContains(unit: SalesUnit, bundleSize: number, isBase: boolean): string | null {
  const contentQuantity = unit.contentQuantity;
  const contentText = (qty: number): string =>
    `${formatQuantity(qty)}${unit.contentLabel ? ` ${unit.contentLabel}` : ''}`;

  if (isBase) {
    return contentQuantity !== null ? contentText(contentQuantity) : null;
  }
  if (unit.label === null) return null;
  const units = `${formatQuantity(bundleSize)} ${pluralizeUnit(unit.label, bundleSize)}`;
  return contentQuantity !== null
    ? `${units} (${contentText(bundleSize * contentQuantity)})`
    : units;
}

function fallbackLabel(unit: SalesUnit, isBase: boolean, bundleSize: number): string {
  if (isBase) return unit.label ? capitalize(unit.label) : 'Unidad';
  return unit.label ? 'Bulto' : `Bulto x${formatQuantity(bundleSize)}`;
}

/** Presentaciones ordenadas por bundleSize ASC, con textos listos para leer. */
export function describePresentations(
  unit: SalesUnit,
  tiers: TierForDisplay[]
): PresentationView[] {
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  if (sorted.length === 0) return [];
  const base = sorted[0];
  const singular = unit.label ?? 'u';

  return sorted.map((tier, index) => {
    const isBase = index === 0;
    const bundleSize = tier.minQuantity;
    const bundlePrice = computeBundlePrice(tier.unitPrice, bundleSize);

    let savingsPercent = 0;
    if (!isBase && base.unitPrice > 0) {
      // epsilon: evita que 0.19999999 (error binario) baje un punto entero
      const raw = Math.floor((1 - tier.unitPrice / base.unitPrice) * 100 + 1e-9);
      savingsPercent = Math.max(0, raw);
    }

    const label = tier.label ?? fallbackLabel(unit, isBase, bundleSize);
    const contains = buildContains(unit, bundleSize, isBase);

    let description = `${label}${contains ? ` de ${contains}` : ''}: ${formatArs(bundlePrice)}`;
    if (!isBase && bundleSize > 1) {
      const parts = [`${formatArs(tier.unitPrice)} c/${singular}`];
      if (savingsPercent > 0) parts.push(`${savingsPercent}% menos`);
      description += ` (${parts.join(', ')})`;
    }

    return {
      priceListId: tier.priceListId,
      bundleSize,
      unitPrice: tier.unitPrice,
      bundlePrice,
      label,
      contains,
      savingsPercent,
      description
    };
  });
}

export function productSummary(name: string, views: PresentationView[]): string | null {
  if (views.length === 0) return null;
  return `${name} viene en: ${views.map((v) => v.description).join('; ')}`;
}

export function presentationSnapshot(view: PresentationView): string {
  const text = view.contains !== null ? `${view.label} · ${view.contains}` : view.label;
  return text.slice(0, SNAPSHOT_MAX);
}

/** Unidad de venta tal como la ven bot y web: null si el producto no define unidad ni contenido. */
export interface PublicUnit {
  label: string;
  contains: { quantity: number; of: string | null } | null;
}

export function toPublicUnit(unit: SalesUnit): PublicUnit | null {
  if (unit.label === null && unit.contentQuantity === null && unit.contentLabel === null) {
    return null;
  }
  return {
    label: unit.label ?? 'unidad',
    contains:
      unit.contentQuantity !== null
        ? { quantity: unit.contentQuantity, of: unit.contentLabel }
        : null
  };
}
