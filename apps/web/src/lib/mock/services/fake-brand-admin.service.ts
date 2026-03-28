/**
 * Mock Brand Admin Service
 * All functions prefixed with fake_ to indicate mock implementation
 */

import { Brand } from '@/types';
import { MOCK_BRANDS } from '../data/brands';
import { MOCK_PRODUCTS } from '../data/products';

const STORAGE_KEY = 'valplas_brands';

// Load brands from localStorage or use defaults
function loadBrands(): Brand[] {
  if (typeof window === 'undefined') return MOCK_BRANDS;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return MOCK_BRANDS;
    }
  }
  return MOCK_BRANDS;
}

// Save brands to localStorage
function saveBrands(brands: Brand[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brands));
  }
}

/**
 * Get all brands with optional filters
 */
export async function fake_getBrands(filters?: {
  search?: string;
  isActive?: boolean;
}): Promise<Brand[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  let brands = loadBrands();

  // Filter by search
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    brands = brands.filter(
      (b) => b.name.toLowerCase().includes(search) || b.slug.toLowerCase().includes(search)
    );
  }

  // Filter by active status
  if (filters?.isActive !== undefined) {
    brands = brands.filter((b) => b.isActive === filters.isActive);
  }

  return brands;
}

/**
 * Get brand by ID
 */
export async function fake_getBrandById(id: string): Promise<Brand | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  const brands = loadBrands();
  return brands.find((b) => b.id === id) ?? null;
}

/**
 * Create a new brand
 */
export async function fake_createBrand(
  data: Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Brand> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const brands = loadBrands();

  // Check slug uniqueness
  if (brands.some((b) => b.slug === data.slug)) {
    throw new Error('Ya existe una marca con ese slug');
  }

  const newBrand: Brand = {
    ...data,
    id: `brand-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  brands.push(newBrand);
  saveBrands(brands);

  return newBrand;
}

/**
 * Update a brand
 */
export async function fake_updateBrand(
  id: string,
  data: Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Brand> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const brands = loadBrands();
  const index = brands.findIndex((b) => b.id === id);

  if (index === -1) {
    throw new Error('Marca no encontrada');
  }

  // Check slug uniqueness (excluding current brand)
  if (data.slug && brands.some((b) => b.id !== id && b.slug === data.slug)) {
    throw new Error('Ya existe una marca con ese slug');
  }

  const updatedBrand: Brand = {
    ...brands[index],
    ...data,
    updatedAt: new Date().toISOString()
  };

  brands[index] = updatedBrand;
  saveBrands(brands);

  return updatedBrand;
}

/**
 * Delete a brand (soft delete)
 */
export async function fake_deleteBrand(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const brands = loadBrands();
  const brand = brands.find((b) => b.id === id);

  if (!brand) {
    throw new Error('Marca no encontrada');
  }

  // Check if brand has products
  const products = MOCK_PRODUCTS.filter((p) => p.brandId === id);
  if (products.length > 0) {
    throw new Error(
      `No se puede eliminar la marca porque tiene ${products.length} producto(s) asociado(s)`
    );
  }

  // Remove brand
  const filtered = brands.filter((b) => b.id !== id);
  saveBrands(filtered);
}

/**
 * Delete multiple brands (bulk delete)
 */
export async function fake_deleteBrands(ids: string[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const brands = loadBrands();

  // Check each brand
  for (const id of ids) {
    const brand = brands.find((b) => b.id === id);
    if (!brand) continue;

    const products = MOCK_PRODUCTS.filter((p) => p.brandId === id);
    if (products.length > 0) {
      throw new Error(
        `La marca "${brand.name}" tiene ${products.length} producto(s) asociado(s) y no puede eliminarse`
      );
    }
  }

  // Remove all brands
  const filtered = brands.filter((b) => !ids.includes(b.id));
  saveBrands(filtered);
}

/**
 * Get product count for a brand
 */
export function fake_getBrandProductCount(brandId: string): number {
  return MOCK_PRODUCTS.filter((p) => p.brandId === brandId).length;
}
