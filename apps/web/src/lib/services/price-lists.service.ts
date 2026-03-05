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

export async function getPriceLists(params?: {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<PriceListsResponse>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return get<PriceListsResponse>(`/price-lists${qs ? `?${qs}` : ''}`);
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
