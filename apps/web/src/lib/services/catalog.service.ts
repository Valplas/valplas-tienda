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

  // El backend espera los query params en snake_case (no hay middleware que
  // convierta requests, solo responses). Mapear explícitamente evita el bug
  // silencioso de enviar categoryId cuando el controller lee category_id.
  const append = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  };

  if (filters) {
    append('search', filters.search);
    append('category_id', filters.categoryId);
    append('brand_id', filters.brandId);
    append('min_price', filters.minPrice);
    append('max_price', filters.maxPrice);
    append('sort', filters.sortBy);
    append('page', filters.page);
    append('limit', filters.limit);
  }

  const queryString = params.toString();
  const endpoint = `/catalog/products${queryString ? `?${queryString}` : ''}`;

  return get<ProductPublic[]>(endpoint);
}
