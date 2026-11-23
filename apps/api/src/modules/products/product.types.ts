import type { Product } from '@valplas/shared/types';
import type { PublicUnit } from '../catalog/presentation.js';

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
  /** Paginación clásica (OFFSET). Si se omite, se pagina por cursor. */
  page?: number;
  /** Cursor opaco de la página anterior. */
  cursor?: string;
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
  unitLabel: string | null;
  unitContentQuantity: number | null;
  unitContentLabel: string | null;
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    displayOrder: number;
    isPrimary: boolean;
    width: number | null;
    height: number | null;
  }>;
  priceTiers: Array<{
    priceListId: string;
    priceListName: string;
    minQuantity: number;
    label: string | null;
    unitPrice: number;
  }>;
}

/**
 * Presentación pública: sin nombre de lista (el nombre expone el margen, ej. "Lista 30%")
 */
export interface PublicPriceTier {
  priceListId: string;
  minQuantity: number;
  unitPrice: number;
  bundlePrice: number;
  label: string;
  contains: string | null;
  savingsPercent: number;
  description: string;
}

/**
 * Producto para endpoints públicos: sin costo, con el precio de venta
 * efectivo ya calculado (tier de menor cantidad mínima, o costo sin lista)
 * y las presentaciones ordenadas por cantidad mínima ascendente
 */
export type PublicProduct = Omit<ProductWithDetails, 'costPrice' | 'priceTiers'> & {
  price: number;
  unit: PublicUnit | null;
  priceTiers: PublicPriceTier[];
};

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
  unitLabel?: string | null;
  unitContentQuantity?: number | null;
  unitContentLabel?: string | null;
  /** Id de sesión de staging de imágenes — ver módulo images/ */
  tempId?: string;
  /** Orden de archivos elegido en el form de creación — ver images/product-image.service.ts */
  tempImageOrder?: string[];
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
  unitLabel?: string | null;
  unitContentQuantity?: number | null;
  unitContentLabel?: string | null;
}
