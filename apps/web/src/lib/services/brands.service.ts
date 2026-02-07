// apps/web/src/lib/services/brands.service.ts

import { get } from '../api';
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
