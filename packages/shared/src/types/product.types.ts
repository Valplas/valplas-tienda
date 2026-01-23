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
  final_price?: number;
  stock: number;
  reserved_stock: number;
  category_id: string | null;
  brand_id: string | null;
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
  stock: number;
  category_id?: string;
  brand_id?: string;
  is_featured?: boolean;
  is_active?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  base_price?: number;
  stock?: number;
  category_id?: string;
  brand_id?: string;
  is_featured?: boolean;
  is_active?: boolean;
}
