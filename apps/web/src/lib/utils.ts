import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number as ARS currency
 * @param amount - Amount to format
 * @returns Formatted currency string (e.g., "$1.234,56")
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Validate a post-auth redirect target. Solo acepta paths relativos same-origin
 * para evitar open redirect (rechaza https://evil.com, //evil.com, /\evil.com).
 * @param target - Valor crudo del query param `redirect`
 * @param fallback - Path a usar si el target es inválido
 */
export function safeRedirect(target: string | null | undefined, fallback: string): string {
  if (target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) {
    return target;
  }
  return fallback;
}

/**
 * Generate a URL-friendly slug from text
 * @param text - Text to convert to slug
 * @returns Slug string (lowercase, no accents, hyphen-separated)
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-'); // Multiple hyphens to single
}
