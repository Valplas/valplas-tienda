// apps/web/src/lib/services/categories.service.ts

import { get } from '../api';
import type { Category } from '@/types';

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
