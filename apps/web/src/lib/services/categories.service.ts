// apps/web/src/lib/services/categories.service.ts

import { get } from '../api';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
  children?: Category[];
  created_at: string;
  updated_at: string;
}

/**
 * Obtener árbol completo de categorías
 */
export async function getCategories(): Promise<Category[]> {
  const response = await get<Category[]>('/categories');

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener categorías');
}

/**
 * Obtener categoría por ID
 */
export async function getCategoryById(id: string): Promise<Category> {
  const response = await get<Category>(`/categories/${id}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener categoría');
}
