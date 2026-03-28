/**
 * Mock Category Admin Service
 * All functions prefixed with fake_ to indicate mock implementation
 */

import { Category } from '@/types';
import { MOCK_CATEGORIES } from '../data/categories';
import { MOCK_PRODUCTS } from '../data/products';
import { getDescendantIds, wouldCreateCircularReference } from '@/lib/utils/tree';

const STORAGE_KEY = 'valplas_categories';

// Load categories from localStorage or use defaults
function loadCategories(): Category[] {
  if (typeof window === 'undefined') return MOCK_CATEGORIES;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return MOCK_CATEGORIES;
    }
  }
  return MOCK_CATEGORIES;
}

// Save categories to localStorage
function saveCategories(categories: Category[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  }
}

/**
 * Get all categories
 */
export async function fake_getCategories(): Promise<Category[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return loadCategories();
}

/**
 * Get category by ID
 */
export async function fake_getCategoryById(id: string): Promise<Category | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const categories = loadCategories();
  return categories.find((c) => c.id === id) ?? null;
}

/**
 * Create a new category
 */
export async function fake_createCategory(
  data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Category> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const categories = loadCategories();

  // Check slug uniqueness
  if (categories.some((c) => c.slug === data.slug)) {
    throw new Error('Ya existe una categoría con ese slug');
  }

  // Validate parent exists if provided
  if (data.parentId) {
    const parentExists = categories.some((c) => c.id === data.parentId);
    if (!parentExists) {
      throw new Error('Categoría padre no encontrada');
    }
  }

  const newCategory: Category = {
    ...data,
    id: `cat-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  categories.push(newCategory);
  saveCategories(categories);

  return newCategory;
}

/**
 * Update a category
 */
export async function fake_updateCategory(
  id: string,
  data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Category> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const categories = loadCategories();
  const index = categories.findIndex((c) => c.id === id);

  if (index === -1) {
    throw new Error('Categoría no encontrada');
  }

  // Check slug uniqueness (excluding current category)
  if (data.slug && categories.some((c) => c.id !== id && c.slug === data.slug)) {
    throw new Error('Ya existe una categoría con ese slug');
  }

  // Validate parent exists and check for circular references
  if (data.parentId !== undefined && data.parentId !== null) {
    const parentExists = categories.some((c) => c.id === data.parentId);
    if (!parentExists) {
      throw new Error('Categoría padre no encontrada');
    }

    // Check circular reference
    if (wouldCreateCircularReference(categories, id, data.parentId)) {
      throw new Error(
        'No se puede establecer esta categoría como padre (crearía una referencia circular)'
      );
    }
  }

  const updatedCategory: Category = {
    ...categories[index],
    ...data,
    updatedAt: new Date().toISOString()
  };

  categories[index] = updatedCategory;
  saveCategories(categories);

  return updatedCategory;
}

/**
 * Delete a category
 */
export async function fake_deleteCategory(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const categories = loadCategories();
  const category = categories.find((c) => c.id === id);

  if (!category) {
    throw new Error('Categoría no encontrada');
  }

  // Check if category has children
  const children = categories.filter((c) => c.parentId === id);
  if (children.length > 0) {
    throw new Error(
      `No se puede eliminar la categoría porque tiene ${children.length} subcategoría(s)`
    );
  }

  // Check if category has products
  const products = MOCK_PRODUCTS.filter((p) => p.categoryId === id);
  if (products.length > 0) {
    throw new Error(
      `No se puede eliminar la categoría porque tiene ${products.length} producto(s) asociado(s)`
    );
  }

  // Remove category
  const filtered = categories.filter((c) => c.id !== id);
  saveCategories(filtered);
}

/**
 * Reorder categories (update displayOrder)
 */
export async function fake_reorderCategories(
  updates: Array<{ id: string; displayOrder: number }>
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const categories = loadCategories();

  updates.forEach((update) => {
    const category = categories.find((c) => c.id === update.id);
    if (category) {
      category.displayOrder = update.displayOrder;
      category.updatedAt = new Date().toISOString();
    }
  });

  saveCategories(categories);
}

/**
 * Get product count for a category (including descendants)
 */
export function fake_getCategoryProductCount(categoryId: string): number {
  const categories = loadCategories();
  const descendantIds = getDescendantIds(categories, categoryId);
  const allIds = [categoryId, ...descendantIds];

  return MOCK_PRODUCTS.filter((p) => allIds.includes(p.categoryId)).length;
}

/**
 * Get direct product count for a category (excluding descendants)
 */
export function fake_getCategoryDirectProductCount(categoryId: string): number {
  return MOCK_PRODUCTS.filter((p) => p.categoryId === categoryId).length;
}
