// apps/web/src/lib/services/brands.service.ts

import { get, post, put, del } from '../api';
import type { Brand } from '@/types';

/** Máximo que acepta la API por página: alcanza para los selectores de marca. */
const MAX_BRANDS_PAGE = 100;

/**
 * Obtener las marcas para selectores y filtros (hasta 100; antes quedaban cortadas en 24).
 * API returns: { success: true, data: Brand[], pagination: {...} }
 */
export async function getBrands(): Promise<Brand[]> {
  const response = await get<Brand[]>(`/brands?limit=${MAX_BRANDS_PAGE}`);
  if (response.success && response.data) {
    return response.data;
  }
  return [];
}

/**
 * Obtener marca por slug
 */
export async function getBrandBySlug(slug: string): Promise<Brand> {
  const response = await get<Brand>(`/brands/slug/${slug}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener marca');
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAdminBrands(params?: {
  /** Sin page se pagina por cursor; con page, OFFSET clásico. */
  page?: number;
  cursor?: string;
  limit?: number;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const res = await get<Brand[]>(`/brands${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) {
    return { brands: [], total: 0, totalPages: 0, hasMore: false, nextCursor: null };
  }
  const pagination = res.pagination;
  return {
    brands: res.data,
    total: pagination?.total ?? res.data.length,
    totalPages: pagination?.totalPages ?? 1,
    hasMore: pagination?.hasMore ?? false,
    nextCursor: pagination?.cursor ?? null
  };
}

export async function createBrand(data: {
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  isActive?: boolean;
}) {
  const res = await post<{ brand: Brand }>('/brands', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear marca');
  return res.data.brand;
}

export async function updateBrand(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    logoUrl: string;
    description: string;
    isActive: boolean;
  }>
) {
  const res = await put<{ brand: Brand }>(`/brands/${id}`, data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al actualizar marca');
  return res.data.brand;
}

export async function deleteBrand(id: string) {
  const res = await del(`/brands/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar marca');
}

export async function deleteBrands(ids: string[]) {
  await Promise.all(ids.map((id) => deleteBrand(id)));
}
