/**
 * Fake Product Admin Service
 * CRUD operations for admin panel
 */

import { Product } from '@/types';
import { ApiResponse } from '@/lib/api';
import { MOCK_PRODUCTS } from '../data/products';
import { MOCK_CATEGORIES } from '../data/categories';
import { MOCK_BRANDS } from '../data/brands';
import * as storage from '../utils/local-storage';

const STORAGE_KEY = 'products';

/**
 * Simulate async delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get products from localStorage or fallback to MOCK_PRODUCTS
 */
function getProducts(): Product[] {
  const stored = storage.getItem<Product[]>(STORAGE_KEY);
  return stored || [...MOCK_PRODUCTS];
}

/**
 * Save products to localStorage
 */
function saveProducts(products: Product[]): void {
  storage.setItem(STORAGE_KEY, products);
}

export interface CreateProductInput {
  name: string;
  sku: string;
  description: string;
  basePrice: number;
  stock: number;
  categoryId: string;
  brandId: string;
  unit?: string;
  isFeatured: boolean;
  isActive: boolean;
  images?: string[];
}

export type UpdateProductInput = Partial<CreateProductInput>;

/**
 * Create a new product
 */
export async function fake_createProduct(data: CreateProductInput): Promise<ApiResponse<Product>> {
  await delay(800);

  const products = getProducts();

  // Check if SKU already exists
  const existingSku = products.find((p) => p.sku === data.sku && !p.deletedAt);
  if (existingSku) {
    return {
      success: false,
      error: {
        code: 'SKU_EXISTS',
        message: 'Ya existe un producto con este SKU'
      }
    };
  }

  // Find category and brand
  const category = MOCK_CATEGORIES.find((c) => c.id === data.categoryId);
  const brand = MOCK_BRANDS.find((b) => b.id === data.brandId);

  if (!category) {
    return {
      success: false,
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoría no encontrada'
      }
    };
  }

  if (!brand) {
    return {
      success: false,
      error: {
        code: 'BRAND_NOT_FOUND',
        message: 'Marca no encontrada'
      }
    };
  }

  // Generate slug from name
  const slug = data.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Create new product
  const newProduct: Product = {
    id: `prod-${Date.now()}`,
    sku: data.sku,
    name: data.name,
    slug,
    description: data.description,
    categoryId: data.categoryId,
    brandId: data.brandId,
    basePrice: data.basePrice,
    costPrice: 0,
    finalPrice: data.basePrice,
    stock: data.stock,
    reservedStock: 0,
    availableStock: data.stock,
    unit: data.unit || 'unidad',
    imageUrl: data.images?.[0] || '/products/placeholder.jpg',
    images: data.images || ['/products/placeholder.jpg'],
    isFeatured: data.isFeatured,
    isActive: data.isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    category,
    brand
  };

  products.push(newProduct);
  saveProducts(products);

  return {
    success: true,
    data: newProduct
  };
}

/**
 * Update an existing product
 */
export async function fake_updateProduct(
  id: string,
  data: UpdateProductInput
): Promise<ApiResponse<Product>> {
  await delay(800);

  const products = getProducts();
  const index = products.findIndex((p) => p.id === id && !p.deletedAt);

  if (index === -1) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Producto no encontrado'
      }
    };
  }

  // Check SKU uniqueness if SKU is being updated
  if (data.sku && data.sku !== products[index].sku) {
    const existingSku = products.find((p) => p.sku === data.sku && p.id !== id && !p.deletedAt);
    if (existingSku) {
      return {
        success: false,
        error: {
          code: 'SKU_EXISTS',
          message: 'Ya existe un producto con este SKU'
        }
      };
    }
  }

  // Update product
  const updatedProduct: Product = {
    ...products[index],
    ...data,
    updatedAt: new Date().toISOString()
  };

  // Recalculate slug if name changed
  if (data.name && data.name !== products[index].name) {
    updatedProduct.slug = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Update finalPrice if basePrice changed
  if (data.basePrice !== undefined) {
    updatedProduct.finalPrice = data.basePrice;
  }

  // Update availableStock if stock changed
  if (data.stock !== undefined) {
    updatedProduct.availableStock = data.stock - updatedProduct.reservedStock;
  }

  // Update imageUrl if images changed
  if (data.images && data.images.length > 0) {
    updatedProduct.imageUrl = data.images[0];
  }

  // Update category relation
  if (data.categoryId) {
    updatedProduct.category = MOCK_CATEGORIES.find((c) => c.id === data.categoryId);
  }

  // Update brand relation
  if (data.brandId) {
    updatedProduct.brand = MOCK_BRANDS.find((b) => b.id === data.brandId);
  }

  products[index] = updatedProduct;
  saveProducts(products);

  return {
    success: true,
    data: updatedProduct
  };
}

/**
 * Delete a product (soft delete)
 */
export async function fake_deleteProduct(id: string): Promise<ApiResponse<void>> {
  await delay(600);

  const products = getProducts();
  const index = products.findIndex((p) => p.id === id && !p.deletedAt);

  if (index === -1) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Producto no encontrado'
      }
    };
  }

  // Soft delete
  products[index] = {
    ...products[index],
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveProducts(products);

  return {
    success: true
  };
}

/**
 * Delete multiple products (bulk soft delete)
 */
export async function fake_deleteProducts(ids: string[]): Promise<ApiResponse<void>> {
  await delay(1000);

  const products = getProducts();
  let deletedCount = 0;

  ids.forEach((id) => {
    const index = products.findIndex((p) => p.id === id && !p.deletedAt);
    if (index !== -1) {
      products[index] = {
        ...products[index],
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      deletedCount++;
    }
  });

  if (deletedCount === 0) {
    return {
      success: false,
      error: {
        code: 'NO_PRODUCTS_DELETED',
        message: 'No se encontraron productos para eliminar'
      }
    };
  }

  saveProducts(products);

  return {
    success: true
  };
}

/**
 * Get product by ID (for editing)
 */
export async function fake_getProductById(id: string): Promise<ApiResponse<Product>> {
  await delay(400);

  const products = getProducts();
  const product = products.find((p) => p.id === id && !p.deletedAt);

  if (!product) {
    return {
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Producto no encontrado'
      }
    };
  }

  return {
    success: true,
    data: product
  };
}
