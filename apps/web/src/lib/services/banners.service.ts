// apps/web/src/lib/services/banners.service.ts

import { get, patch, put, del, postFormData } from '../api';
import { CACHE_TAGS } from '../cache-tags';
import type { AdminBanner, PublicBanner } from '@/types';

// TTL corto como red de seguridad: la API revalida el tag al guardar, y los
// 60s cubren el inicio/fin de vigencia (no hay evento que lo dispare).
const PUBLIC_BANNERS_REVALIDATE_SECONDS = 60;
const PUBLIC_BANNERS_LIMIT = 20;
const ADMIN_BANNERS_LIMIT = 100;

/**
 * Banners visibles de la home, en orden. Nunca lanza: sin banners la home
 * muestra el hero de texto.
 */
export async function getPublicBanners(): Promise<PublicBanner[]> {
  try {
    const res = await get<PublicBanner[]>(`/banners?limit=${PUBLIC_BANNERS_LIMIT}`, {
      silentErrors: true,
      next: { tags: [CACHE_TAGS.BANNERS], revalidate: PUBLIC_BANNERS_REVALIDATE_SECONDS }
    });
    return res.success && res.data ? res.data : [];
  } catch (error) {
    console.error('Error loading banners:', error);
    return [];
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Body de alta/edición: snake_case, como lo esperan los controllers. */
export interface BannerPayload {
  title: string;
  link_category_id: string | null;
  link_brand_id: string | null;
  link_product_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface BannerImages {
  desktop: File;
  /** null = en celular se usa la imagen de PC */
  mobile: File | null;
}

function appendImages(formData: FormData, images: BannerImages) {
  formData.append('desktop_image', images.desktop);
  if (images.mobile) formData.append('mobile_image', images.mobile);
}

/**
 * Trae todos los banners (incluidos inactivos) en orden. El reorden necesita
 * la lista completa, por eso se pide el máximo de una vez.
 */
export async function getAdminBanners(): Promise<{ banners: AdminBanner[]; total: number }> {
  const res = await get<AdminBanner[]>(`/banners/admin?limit=${ADMIN_BANNERS_LIMIT}`);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al cargar banners');
  return { banners: res.data, total: res.pagination?.total ?? res.data.length };
}

export async function createBanner(payload: BannerPayload, images: BannerImages) {
  const formData = new FormData();
  appendImages(formData, images);
  for (const [key, value] of Object.entries(payload)) {
    formData.append(key, value === null ? '' : String(value));
  }

  const res = await postFormData<{ banner: AdminBanner }>('/banners', formData);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear banner');
  return res.data.banner;
}

export async function updateBanner(id: string, payload: Partial<BannerPayload>) {
  const res = await patch<{ banner: AdminBanner }>(`/banners/${id}`, payload);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al actualizar banner');
  }
  return res.data.banner;
}

export async function replaceBannerImages(id: string, images: BannerImages) {
  const formData = new FormData();
  appendImages(formData, images);

  const res = await postFormData<{ banner: AdminBanner }>(`/banners/${id}/images`, formData);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al reemplazar imágenes');
  }
  return res.data.banner;
}

export async function reorderBanners(bannerIds: string[]) {
  const res = await put('/banners/order', { banner_ids: bannerIds });
  if (!res.success) throw new Error(res.error?.message ?? 'Error al reordenar banners');
}

export async function deleteBanner(id: string) {
  const res = await del(`/banners/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar banner');
}
