/**
 * Fake Category Service - Categorías mock
 * Simula operaciones de categorías con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { Category } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit } from '../utils/local-storage';
import { MOCK_CATEGORIES } from '../data';

const STORAGE_KEY = 'categories';

/**
 * Inicializa categorías en localStorage si no existen
 */
function initCategories(): Category[] {
  return getOrInit(STORAGE_KEY, MOCK_CATEGORIES);
}

/**
 * Obtener todas las categorías activas
 */
export async function fake_getCategories(): Promise<ApiResponse<Category[]>> {
  return fakeFetch(() => {
    const categories = initCategories();
    const active = categories.filter((c) => c.is_active);

    // Ordenar por display_order
    active.sort((a, b) => a.display_order - b.display_order);

    return {
      success: true,
      data: active
    };
  });
}

/**
 * Obtener categorías raíz (sin parent_id)
 */
export async function fake_getRootCategories(): Promise<ApiResponse<Category[]>> {
  return fakeFetch(() => {
    const categories = initCategories();
    const root = categories.filter((c) => c.is_active && c.parent_id === null);

    root.sort((a, b) => a.display_order - b.display_order);

    return {
      success: true,
      data: root
    };
  });
}

/**
 * Obtener subcategorías de una categoría
 */
export async function fake_getSubcategories(parentId: string): Promise<ApiResponse<Category[]>> {
  return fakeFetch(() => {
    const categories = initCategories();
    const subcategories = categories.filter((c) => c.is_active && c.parent_id === parentId);

    subcategories.sort((a, b) => a.display_order - b.display_order);

    return {
      success: true,
      data: subcategories
    };
  });
}

/**
 * Obtener categoría por ID
 */
export async function fake_getCategoryById(id: string): Promise<ApiResponse<Category>> {
  return fakeFetch(() => {
    const categories = initCategories();
    const category = categories.find((c) => c.id === id);

    if (!category) {
      return {
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Categoría no encontrada'
        }
      };
    }

    return {
      success: true,
      data: category
    };
  });
}

/**
 * Obtener categoría por slug
 */
export async function fake_getCategoryBySlug(slug: string): Promise<ApiResponse<Category>> {
  return fakeFetch(() => {
    const categories = initCategories();
    const category = categories.find((c) => c.slug === slug);

    if (!category) {
      return {
        success: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Categoría no encontrada'
        }
      };
    }

    return {
      success: true,
      data: category
    };
  });
}
