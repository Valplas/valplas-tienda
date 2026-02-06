// apps/web/src/lib/services/brands.service.ts

import { get } from '../api';
import type { ApiResponse } from '../api';

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
