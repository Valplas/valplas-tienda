/**
 * Cálculos de precio por presentación (tier). Misma fórmula que el backend
 * (apps/api/src/modules/orders/order-pricing.ts → computeBundlePrice): truncado a
 * centavos, así lo que se muestra coincide con lo que se cobra.
 */

/** Precio de un bulto: precio unitario de la lista × unidades por bulto. */
export function computeBundlePrice(unitPrice: number, bundleSize: number): number {
  return Math.trunc(unitPrice * bundleSize * 100) / 100;
}

/** Subtotal de una línea: precio del bulto × cantidad de bultos. */
export function computeLineSubtotal(bundlePrice: number, bundles: number): number {
  return Math.trunc(bundlePrice * bundles * 100) / 100;
}

/**
 * Etiqueta por defecto de una presentación. Solo fallback: la API manda el nombre real
 * (`label` / `presentationLabel`); esto cubre datos viejos (ej. carrito local sin el campo).
 * Nunca usar el nombre de la lista (expone margen).
 */
export function presentationLabel(bundleSize: number): string {
  return bundleSize > 1 ? `Bulto x${bundleSize}` : 'Unidad';
}
