// apps/web/src/lib/services/products.service.ts

import { get } from '../api';
import type { ApiResponse } from '../api';
import type { Product } from '@/types';

// Re-export Product type for convenience
export type { Product };

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
}

/**
 * Obtener lista de productos con filtros
 */
export async function getProducts(filters?: ProductFilters): Promise<ApiResponse<Product[]>> {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
  }

  const queryString = params.toString();
  const endpoint = `/products${queryString ? `?${queryString}` : ''}`;

  return get<Product[]>(endpoint);
}

/**
 * Obtener producto por ID
 */
export async function getProductById(id: string): Promise<Product> {
  const response = await get<Product>(`/products/${id}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener producto');
}

/**
 * Obtener producto por slug
 */
export async function getProductBySlug(slug: string): Promise<Product> {
  const response = await get<Product>(`/products/slug/${slug}`);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener producto');
}
