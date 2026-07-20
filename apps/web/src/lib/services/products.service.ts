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

// El backend envuelve el producto único en { product: {...} } (ApiResponse.success({ product })).
type SingleProductResponse = { product: DetailRawProduct };

// Shape crudo de un producto individual: campos planos de categoría/marca +
// imágenes como objetos. ProductDetail espera category/brand anidados,
// images como string[] y tiers (no priceTiers), así que adaptamos.
interface DetailRawProduct extends RawProduct {
  categoryName?: string;
  brandName?: string;
  sku?: string;
  availableStock?: number;
  description?: string;
}

/**
 * Adapta el producto crudo de la API al shape que consume <ProductDetail>:
 * - images: string[] (extrae url de cada objeto)
 * - tiers: desde priceTiers
 * - category/brand: objetos { id, name } desde los campos planos
 */
function adaptProductDetail(raw: DetailRawProduct): Product {
  const images = Array.isArray(raw.images)
    ? raw.images.map((img) => (typeof img === 'string' ? img : img?.url)).filter(Boolean)
    : [];

  return {
    ...raw,
    images,
    tiers: raw.priceTiers ?? [],
    category: raw.categoryId ? { id: raw.categoryId, name: raw.categoryName ?? '' } : null,
    brand: raw.brandId ? { id: raw.brandId, name: raw.brandName ?? '' } : null
  } as unknown as Product;
}

/**
 * Obtener producto por ID
 */
export async function getProductById(id: string): Promise<Product> {
  const response = await get<SingleProductResponse>(`/products/${id}`);

  if (response.success && response.data?.product) {
    return adaptProductDetail(response.data.product);
  }

  throw new Error(response.error?.message || 'Error al obtener producto');
}

/**
 * Obtener producto por slug
 */
export async function getProductBySlug(slug: string): Promise<Product> {
  const response = await get<SingleProductResponse>(`/products/slug/${slug}`);

  if (response.success && response.data?.product) {
    return adaptProductDetail(response.data.product);
  }

  throw new Error(response.error?.message || 'Error al obtener producto');
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

// Raw shape returned by the API for a single product (all camelCase)
interface RawProduct {
  id: string;
  name: string;
  slug: string;
  description?: string;
  costPrice: number; // pesos ARS
  isActive: boolean;
  categoryId?: string;
  brandId?: string;
  availableStock?: number;
  images?: Array<{ url: string; alt?: string }>;
  priceTiers?: Array<{
    priceListId: string;
    priceListName: string;
    minQuantity: number;
    unitPrice: number;
  }>;
  [key: string]: unknown;
}

/**
 * Maps API response fields to the frontend Product shape.
 * API returns camelCase after middleware conversion.
 */
export function normalizeProduct(raw: RawProduct): Product {
  const costPrice = raw.costPrice ?? 0;
  // Precio efectivo de venta: tier de menor cantidad mínima, o el costo si no hay lista
  const tiers = [...(raw.priceTiers ?? [])].sort((a, b) => a.minQuantity - b.minQuantity);
  const price = tiers[0]?.unitPrice ?? costPrice;
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? '',
    costPrice,
    price,
    finalPrice: price,
    isActive: raw.isActive,
    categoryId: raw.categoryId ?? '',
    brandId: raw.brandId ?? '',
    availableStock: raw.availableStock ?? 0,
    imageUrl: raw.images?.[0]?.url ?? '',
    sku: (raw.sku as string) ?? '',
    stock: (raw.stock as number) ?? 0,
    weight: (raw.weight as number | null) ?? null,
    width: (raw.width as number | null) ?? null,
    length: (raw.length as number | null) ?? null,
    height: (raw.height as number | null) ?? null,
    origin: (raw.origin as string | null) ?? null,
    isFeatured: (raw.isFeatured as boolean) ?? false,
    tiers: raw.priceTiers ?? []
  } as unknown as Product;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export type AdminProductSort =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'stock_asc'
  | 'stock_desc'
  | 'updated_desc'
  | 'updated_asc';

export async function getAdminProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
  sort?: AdminProductSort;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.categoryId) query.set('category_id', params.categoryId);
  if (params?.brandId) query.set('brand_id', params.brandId);
  if (params?.isActive !== undefined) query.set('is_active', String(params.isActive));
  if (params?.sort) query.set('sort', params.sort);

  const qs = query.toString();
  // API returns paginated shape: { success, data: RawProduct[], pagination: { total, totalPages, ... } }
  const res = await get<RawProduct[]>(`/products${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) return { products: [], total: 0, totalPages: 0 };
  return {
    products: res.data.map(normalizeProduct),
    total: res.pagination?.total ?? 0,
    totalPages: res.pagination?.totalPages ?? 0
  };
}

export async function createProduct(data: {
  name: string;
  slug: string;
  description?: string;
  costPrice: number; // pesos ARS
  categoryId: string;
  brandId?: string;
  sku: string; // required by backend
  stock?: number;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  isFeatured?: boolean;
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
    costPrice: number; // pesos ARS
    categoryId: string;
    brandId: string;
    sku: string;
    stock: number;
    weight: number;
    width: number;
    length: number;
    height: number;
    origin: string;
    isFeatured: boolean;
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
