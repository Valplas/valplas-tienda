/**
 * Tipos compartidos para productos
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  costPrice: number;
  finalPrice?: number;
  stock: number;
  reservedStock: number;
  categoryId: string | null;
  brandId: string | null;
  weight: number | null; // kg
  width: number | null; // cm
  length: number | null; // cm
  height: number | null; // cm
  origin: string | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  costPrice: number;
  stock: number;
  categoryId?: string;
  brandId?: string;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  costPrice?: number;
  stock?: number;
  categoryId?: string;
  brandId?: string;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  origin?: string;
  isFeatured?: boolean;
  isActive?: boolean;
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreatePriceListInput {
  name: string;
  margin: number;
  discount?: number;
  isActive?: boolean;
}

export interface UpdatePriceListInput {
  name?: string;
  margin?: number;
  discount?: number;
  isActive?: boolean;
}
