/**
 * Tags de cache de los fetch públicos. Deben coincidir con WEB_CACHE_TAGS de
 * la API (apps/api/src/infrastructure/external/web-revalidation.ts), que los
 * invalida vía POST /api/revalidate al cambiar banners o el logo.
 */
export const CACHE_TAGS = {
  BANNERS: 'banners',
  STORE_SETTINGS: 'store-settings'
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export const REVALIDATABLE_TAGS: readonly CacheTag[] = Object.values(CACHE_TAGS);
