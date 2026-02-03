import type { Product } from '@valplas/shared/types';

/**
 * Filtros para búsqueda de productos
 */
export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  page?: number;
  limit?: number;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest' | 'oldest';
}

/**
 * Producto con información extendida (joins)
 */
export interface ProductWithDetails extends Omit<Product, 'categoryId' | 'brandId'> {
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  availableStock: number;
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    displayOrder: number;
    isPrimary: boolean;
  }>;
}

/**
 * Datos para crear producto
 */
export interface CreateProductData {
  sku: string;
  name: string;
  slug: string;
  description?: string;
  categoryId: string;
  brandId?: string;
  basePrice: number;
  stock?: number;
  isFeatured?: boolean;
}

/**
 * Datos para actualizar producto
 */
export interface UpdateProductData {
  name?: string;
  slug?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  basePrice?: number;
  stock?: number;
  isFeatured?: boolean;
  isActive?: boolean;
}
