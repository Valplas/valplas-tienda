/**
 * Product Sorting Utilities
 */

import { ProductPublic } from '@/types';
import { SortOption } from '@/types/filter.types';

/**
 * Obtiene el precio de referencia para ordenar (primer tier o price)
 */
function getRefPrice(product: ProductPublic): number {
  return product.tiers.length > 0 ? product.tiers[0].unitPrice : product.price;
}

/**
 * Ordena productos según la opción seleccionada
 */
export function sortProducts(products: ProductPublic[], sortBy: SortOption): ProductPublic[] {
  const sorted = [...products];

  switch (sortBy) {
    case 'featured':
      // Sin campo isFeatured en ProductPublic — ordenar por precio
      return sorted.sort((a, b) => getRefPrice(a) - getRefPrice(b));

    case 'price_asc':
      return sorted.sort((a, b) => getRefPrice(a) - getRefPrice(b));

    case 'price_desc':
      return sorted.sort((a, b) => getRefPrice(b) - getRefPrice(a));

    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'es-AR'));

    case 'name_desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name, 'es-AR'));

    case 'newest':
      // Sin campo createdAt en ProductPublic — mantener orden original
      return sorted;

    default:
      return sorted;
  }
}
