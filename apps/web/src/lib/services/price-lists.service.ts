// apps/web/src/lib/services/price-lists.service.ts

import { get, post, patch, del } from '../api';
import type { ApiResponse } from '../api';
import type { PriceList } from '@/types';

export interface PriceListsResponse {
  priceLists: PriceList[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface PriceCalculationResult {
  costPrice: number;
  margin: number;
  unitPrice: number;
}

export interface GetPriceListsParams {
  search?: string;
  isActive?: boolean;
  /** Sin page se pagina por cursor; con page, OFFSET clásico. */
  page?: number;
  cursor?: string;
  limit?: number;
}

/** La API devuelve la lista en `data` y la paginación al nivel superior. */
async function fetchPriceLists(params?: GetPriceListsParams) {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params?.page) query.set('page', String(params.page));
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return get<PriceList[]>(`/price-lists${qs ? `?${qs}` : ''}`);
}

/**
 * Página de listas de precio con el cursor de la siguiente (para el scroll infinito del admin).
 */
export async function getPriceListsPage(params?: GetPriceListsParams) {
  const res = await fetchPriceLists(params);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al cargar listas de precio');
  }
  return {
    priceLists: res.data,
    hasMore: res.pagination?.hasMore ?? false,
    nextCursor: res.pagination?.cursor ?? null
  };
}

/**
 * Listas de precio para selectores. Conserva la forma `{ data: { priceLists } }` que ya consumen
 * los formularios del admin.
 */
export async function getPriceLists(
  params?: GetPriceListsParams
): Promise<ApiResponse<PriceListsResponse>> {
  const res = await fetchPriceLists(params);
  const { data, pagination, ...rest } = res;
  return {
    ...rest,
    data: data
      ? {
          priceLists: data,
          pagination: {
            page: pagination?.page ?? 1,
            limit: pagination?.limit ?? data.length,
            total: pagination?.total ?? data.length,
            totalPages: pagination?.totalPages ?? 1,
            hasMore: pagination?.hasMore ?? false
          }
        }
      : undefined
  };
}

export async function getPriceListById(id: string): Promise<ApiResponse<{ priceList: PriceList }>> {
  return get<{ priceList: PriceList }>(`/price-lists/${id}`);
}

export async function createPriceList(data: {
  name: string;
  margin: number;
  discount?: number;
  isActive?: boolean;
}): Promise<ApiResponse<{ priceList: PriceList }>> {
  return post<{ priceList: PriceList }>('/price-lists', data);
}

export async function updatePriceList(
  id: string,
  data: Partial<{ name: string; margin: number; discount: number; isActive: boolean }>
): Promise<ApiResponse<{ priceList: PriceList }>> {
  return patch<{ priceList: PriceList }>(`/price-lists/${id}`, data);
}

export async function deletePriceList(id: string): Promise<ApiResponse<{ message: string }>> {
  return del<{ message: string }>(`/price-lists/${id}`);
}

export async function calculatePrice(
  priceListId: string,
  productId: string
): Promise<ApiResponse<PriceCalculationResult>> {
  return get<PriceCalculationResult>(
    `/price-lists/${priceListId}/calculate?product_id=${productId}`
  );
}
