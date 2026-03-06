// apps/web/src/lib/services/products.service.ts

import { get, post, put, del } from '../api';
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

// ─── Admin helpers ────────────────────────────────────────────────────────────

// Raw shape returned by the API for a single product (camelCase mixed with snake_case)
interface RawProduct {
  id: string;
  name: string;
  slug: string;
  description?: string;
  base_price: number; // centavos
  is_active: boolean;
  categoryId?: string;
  brandId?: string;
  availableStock?: number;
  images?: Array<{ url: string; alt?: string }>;
  [key: string]: unknown;
}

/**
 * Maps API response fields to the frontend Product shape:
 * - camelCase → snake_case
 * - centavos → pesos
 * - images[0].url → image_url
 */
export function normalizeProduct(raw: RawProduct): Product {
  const basePricePesos = (raw.base_price ?? 0) / 100;
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? '',
    base_price: basePricePesos,
    final_price: basePricePesos,
    is_active: raw.is_active,
    category_id: raw.categoryId ?? '',
    brand_id: raw.brandId ?? '',
    available_stock: raw.availableStock ?? 0,
    image_url: raw.images?.[0]?.url ?? ''
  } as unknown as Product;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAdminProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.categoryId) query.set('categoryId', params.categoryId);
  if (params?.brandId) query.set('brandId', params.brandId);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));

  const qs = query.toString();
  const res = await get<{ products: RawProduct[]; total: number; totalPages: number }>(
    `/products${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) return { products: [], total: 0, totalPages: 0 };
  return {
    products: res.data.products.map(normalizeProduct),
    total: res.data.total,
    totalPages: res.data.totalPages
  };
}

export async function createProduct(data: {
  name: string;
  slug: string;
  description?: string;
  basePrice: number; // centavos
  categoryId: string;
  brandId: string;
  isActive?: boolean;
}) {
  const res = await post<{ product: RawProduct }>('/products', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear producto');
  return normalizeProduct(res.data.product);
}

export async function updateProduct(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    description: string;
    basePrice: number; // centavos
    categoryId: string;
    brandId: string;
    isActive: boolean;
  }>
) {
  const res = await put<{ product: RawProduct }>(`/products/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar producto');
  return normalizeProduct(res.data.product);
}

export async function deleteProduct(id: string) {
  const res = await del(`/products/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar producto');
}
