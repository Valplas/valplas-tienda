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
  /** true = solo activos, false = solo inactivos, undefined = todos (solo admin/owner) */
  isActive?: boolean;
  requireActiveTier?: boolean;
  page?: number;
  limit?: number;
  sort?:
    | 'price_asc'
    | 'price_desc'
    | 'name_asc'
    | 'name_desc'
    | 'newest'
    | 'oldest'
    | 'stock_asc'
    | 'stock_desc'
    | 'updated_desc'
    | 'updated_asc';
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
  priceTiers: Array<{
    priceListId: string;
    priceListName: string;
    minQuantity: number;
    unitPrice: number;
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
  costPrice: number;
  stock?: number;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
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
  costPrice?: number;
  stock?: number;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}
