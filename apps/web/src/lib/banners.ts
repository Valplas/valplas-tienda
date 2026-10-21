import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { AdminBanner, PublicBanner } from '@/types';

dayjs.extend(utc);
dayjs.extend(timezone);

const STORE_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Proporciones de recorte (ancho / alto). Deben coincidir con el carrusel. */
export const BANNER_ASPECT = {
  desktop: 3,
  mobile: 4 / 3
} as const;

type BannerLink = Pick<PublicBanner, 'linkProductSlug' | 'linkCategoryId' | 'linkBrandId'>;

/**
 * Destino del clic: el producto tiene prioridad (abre su ficha); si no,
 * catálogo filtrado por categoría y/o marca; si no hay nada, sin link.
 */
export function buildBannerHref(banner: BannerLink): string | null {
  if (banner.linkProductSlug) return `/productos/${banner.linkProductSlug}`;

  const params = new URLSearchParams();
  if (banner.linkCategoryId) params.set('category_id', banner.linkCategoryId);
  if (banner.linkBrandId) params.set('brand_id', banner.linkBrandId);
  const qs = params.toString();
  return qs ? `/productos?${qs}` : null;
}

export interface BannerLinkNames {
  productName?: string | null;
  categoryName?: string | null;
  brandName?: string | null;
}

/** Frase en lenguaje simple de qué pasa al tocar el banner. */
export function describeBannerLink({ productName, categoryName, brandName }: BannerLinkNames) {
  if (productName) return `Abre el producto «${productName}»`;
  if (categoryName && brandName) {
    return `Muestra los productos de «${categoryName}» de la marca «${brandName}»`;
  }
  if (categoryName) return `Muestra los productos de la categoría «${categoryName}»`;
  if (brandName) return `Muestra los productos de la marca «${brandName}»`;
  return 'No lleva a ningún lado';
}

export type BannerStatusTone = 'visible' | 'scheduled' | 'hidden';

export interface BannerStatus {
  label: string;
  tone: BannerStatusTone;
}

export function formatBannerDate(iso: string): string {
  return dayjs(iso).tz(STORE_TIMEZONE).format('DD/MM/YYYY');
}

export function getBannerStatus(
  banner: Pick<AdminBanner, 'isActive' | 'startsAt' | 'endsAt'>,
  now: Date = new Date()
): BannerStatus {
  if (!banner.isActive) return { label: 'Desactivado', tone: 'hidden' };
  if (banner.endsAt && new Date(banner.endsAt) <= now) {
    return { label: `Vencido el ${formatBannerDate(banner.endsAt)}`, tone: 'hidden' };
  }
  if (banner.startsAt && new Date(banner.startsAt) > now) {
    return { label: `Se muestra desde el ${formatBannerDate(banner.startsAt)}`, tone: 'scheduled' };
  }
  if (banner.endsAt) {
    return { label: `Visible hasta el ${formatBannerDate(banner.endsAt)}`, tone: 'visible' };
  }
  return { label: 'Visible', tone: 'visible' };
}

/** 'YYYY-MM-DD' (input date) → inicio de ese día en hora de Argentina, ISO. */
export function dateInputToStartOfDay(value: string): string | null {
  return value ? dayjs.tz(value, STORE_TIMEZONE).startOf('day').toISOString() : null;
}

/** 'YYYY-MM-DD' (input date) → fin de ese día en hora de Argentina, ISO. */
export function dateInputToEndOfDay(value: string): string | null {
  return value ? dayjs.tz(value, STORE_TIMEZONE).endOf('day').toISOString() : null;
}

/** ISO → 'YYYY-MM-DD' en hora de Argentina, para precargar un input date. */
export function isoToDateInput(iso: string | null): string {
  return iso ? dayjs(iso).tz(STORE_TIMEZONE).format('YYYY-MM-DD') : '';
}
