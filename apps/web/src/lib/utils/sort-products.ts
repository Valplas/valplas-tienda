/**
 * Product Sorting Utilities
 */

import { Product } from '@/types';
import { SortOption } from '@/types/filter.types';

/**
 * Ordena productos según la opción seleccionada
 */
export function sortProducts(products: Product[], sortBy: SortOption): Product[] {
  const sorted = [...products];

  switch (sortBy) {
    case 'featured':
      // Featured primero, luego por precio
      return sorted.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return a.final_price - b.final_price;
      });

    case 'price_asc':
      return sorted.sort((a, b) => a.final_price - b.final_price);

    case 'price_desc':
      return sorted.sort((a, b) => b.final_price - a.final_price);

    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'es-AR'));

    case 'name_desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name, 'es-AR'));

    case 'newest':
      return sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    default:
      return sorted;
  }
}
