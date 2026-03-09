// apps/web/src/lib/services/categories.service.ts

import { get, post, put, del } from '../api';
import type { Category } from '@/types';

/**
 * Obtener árbol completo de categorías
 * API returns: { success: true, data: { categories: Category[] } }
 */
export async function getCategories(): Promise<Category[]> {
  const response = await get<{ categories: Category[] }>('/categories');

  if (response.success && response.data) {
    return response.data.categories ?? [];
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

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function createCategory(data: {
  name: string;
  slug: string;
  parentId?: string;
  isActive?: boolean;
  displayOrder?: number;
  description?: string | null;
  imageUrl?: string | null;
}) {
  const res = await post<{ category: Category }>('/categories', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear categoría');
  return res.data.category;
}

export async function updateCategory(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    parentId: string | null;
    isActive: boolean;
    displayOrder: number;
    description: string | null;
    imageUrl: string | null;
  }>
) {
  const res = await put<{ category: Category }>(`/categories/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar categoría');
  return res.data.category;
}

export async function deleteCategory(id: string) {
  const res = await del(`/categories/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar categoría');
}
