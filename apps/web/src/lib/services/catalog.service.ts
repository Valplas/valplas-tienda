import { get } from '../api';
import type { ApiResponse } from '../api';
import type { ProductPublic, CatalogFilters } from '@/types';

/**
 * Obtener productos públicos con tiers de precio
 */
export async function getCatalogProducts(
  filters?: CatalogFilters
): Promise<ApiResponse<ProductPublic[]>> {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
  }

  const queryString = params.toString();
  const endpoint = `/catalog/products${queryString ? `?${queryString}` : ''}`;

  return get<ProductPublic[]>(endpoint);
}
