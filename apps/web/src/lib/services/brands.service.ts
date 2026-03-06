// apps/web/src/lib/services/brands.service.ts

import { get, post, put, del } from '../api';
import type { ApiResponse } from '../api';
import type { Brand } from '@/types';

/**
 * Obtener todas las marcas activas
 */
export async function getBrands(): Promise<ApiResponse<Brand[]>> {
  return get<Brand[]>('/brands');
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

export async function getAdminBrands(params?: { page?: number; limit?: number; search?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const res = await get<{
    brands: Brand[];
    pagination: {
      total: number;
      totalPages: number;
      page: number;
      limit: number;
      hasMore: boolean;
    };
  }>(`/brands${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) return { brands: [], total: 0, totalPages: 0 };
  return {
    brands: res.data.brands ?? [],
    total: res.data.pagination?.total ?? res.data.brands?.length ?? 0,
    totalPages: res.data.pagination?.totalPages ?? 1
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
