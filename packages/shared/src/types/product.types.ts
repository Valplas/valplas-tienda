/**
 * Tipos compartidos para productos
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  cost_price: number;
  final_price?: number;
  stock: number;
  reserved_stock: number;
  category_id: string | null;
  brand_id: string | null;
  weight: number | null; // kg
  width: number | null; // cm
  length: number | null; // cm
  height: number | null; // cm
  origin: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductWithRelations extends Product {
  category?: Category;
  brand?: Brand;
  images?: ProductImage[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
  created_at: string;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  base_price: number;
  cost_price?: number;
  stock: number;
  category_id?: string;
  brand_id?: string;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  is_featured?: boolean;
  is_active?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  base_price?: number;
  cost_price?: number;
  stock?: number;
  category_id?: string;
  brand_id?: string;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  is_featured?: boolean;
  is_active?: boolean;
}

export interface ProductPriceTier {
  id: string;
  productId: string;
  priceListId: string;
  priceListName: string;
  minQuantity: number; // bundle size: 1=unit, 10=box, 50=pallet
  unitPrice: number; // price per individual unit (NUMERIC decimal)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceList {
  id: string;
  name: string;
  margin: number; // e.g. 50.0 = 50%
  discount: number; // stored, not used in formula yet
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreatePriceListInput {
  name: string;
  margin: number;
  discount?: number;
  is_active?: boolean;
}

export interface UpdatePriceListInput {
  name?: string;
  margin?: number;
  discount?: number;
  is_active?: boolean;
}
