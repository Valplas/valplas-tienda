import type { Category } from '@valplas/shared/types';

/**
 * Categoría con subcategorías anidadas
 */
export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

/**
 * Categoría con conteo de productos
 */
export interface CategoryWithCount extends Category {
  productCount: number;
  children?: CategoryWithCount[];
}

/**
 * Datos para crear categoría
 */
export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  displayOrder?: number;
}

/**
 * Datos para actualizar categoría
 */
export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * Datos para reordenar categorías
 */
export interface ReorderCategoryData {
  id: string;
  displayOrder: number;
}
