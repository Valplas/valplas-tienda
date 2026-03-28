/**
 * Fake Product Service - Productos mock
 * Simula operaciones CRUD de productos con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { Product, ProductFilters, PaginatedResponse, PaginationParams } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit, setItem } from '../utils/local-storage';
import { MOCK_PRODUCTS } from '../data';

const STORAGE_KEY = 'products';

/**
 * Inicializa productos en localStorage si no existen
 */
function initProducts(): Product[] {
  return getOrInit(STORAGE_KEY, MOCK_PRODUCTS);
}

/**
 * Guarda productos en localStorage
 */
function saveProducts(products: Product[]): void {
  setItem(STORAGE_KEY, products);
}

/**
 * Filtra productos según criterios
 */
function filterProducts(products: Product[], filters: ProductFilters): Product[] {
  let filtered = [...products];

  // Filtrar por categoría
  if (filters.categoryId) {
    filtered = filtered.filter((p) => p.categoryId === filters.categoryId);
  }

  // Filtrar por marca
  if (filters.brandId) {
    filtered = filtered.filter((p) => p.brandId === filters.brandId);
  }

  // Filtrar por rango de precio (usar finalPrice)
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.finalPrice >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.finalPrice <= filters.maxPrice!);
  }

  // Filtrar por búsqueda (nombre, descripción, SKU)
  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search)
    );
  }

  // Filtrar por featured
  if (filters.isFeatured !== undefined) {
    filtered = filtered.filter((p) => p.isFeatured === filters.isFeatured);
  }

  // Filtrar por active (default: solo activos)
  if (filters.isActive !== undefined) {
    filtered = filtered.filter((p) => p.isActive === filters.isActive);
  } else {
    // Por defecto, solo productos activos
    filtered = filtered.filter((p) => p.isActive);
  }

  return filtered;
}

/**
 * Pagina resultados
 */
function paginate<T>(items: T[], params: PaginationParams): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const start = (page - 1) * limit;
  const end = start + limit;

  const paginatedItems = items.slice(start, end);
  const total = items.length;
  const totalPages = Math.ceil(total / limit);

  return {
    data: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages
    }
  };
}

/**
 * Obtener todos los productos con filtros y paginación
 */
export async function fake_getProducts(
  filters: ProductFilters = {},
  pagination: PaginationParams = {}
): Promise<ApiResponse<Product[]>> {
  return fakeFetch(() => {
    const products = initProducts();
    const filtered = filterProducts(products, filters);

    // Ordenar por finalPrice (SIEMPRE)
    filtered.sort((a, b) => a.finalPrice - b.finalPrice);

    const paginated = paginate(filtered, pagination);

    return {
      success: true,
      data: paginated.data,
      pagination: paginated.pagination
    };
  });
}

/**
 * Obtener producto por ID
 */
export async function fake_getProductById(id: string): Promise<ApiResponse<Product>> {
  return fakeFetch(() => {
    const products = initProducts();
    const product = products.find((p) => p.id === id);

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
  });
}

/**
 * Obtener producto por slug
 */
export async function fake_getProductBySlug(slug: string): Promise<ApiResponse<Product>> {
  return fakeFetch(() => {
    const products = initProducts();
    const product = products.find((p) => p.slug === slug);

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
  });
}

/**
 * Obtener productos destacados
 */
export async function fake_getFeaturedProducts(limit: number = 8): Promise<ApiResponse<Product[]>> {
  return fakeFetch(() => {
    const products = initProducts();
    const featured = products
      .filter((p) => p.isFeatured && p.isActive)
      .sort((a, b) => a.finalPrice - b.finalPrice)
      .slice(0, limit);

    return {
      success: true,
      data: featured
    };
  });
}

/**
 * Crear producto (admin)
 */
export async function fake_createProduct(
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ApiResponse<Product>> {
  return fakeFetch(() => {
    const products = initProducts();

    // Verificar SKU duplicado
    if (products.some((p) => p.sku === productData.sku)) {
      return {
        success: false,
        error: {
          code: 'SKU_EXISTS',
          message: 'Ya existe un producto con ese SKU'
        }
      };
    }

    // Verificar slug duplicado
    if (products.some((p) => p.slug === productData.slug)) {
      return {
        success: false,
        error: {
          code: 'SLUG_EXISTS',
          message: 'Ya existe un producto con ese slug'
        }
      };
    }

    const newProduct: Product = {
      ...productData,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    products.push(newProduct);
    saveProducts(products);

    return {
      success: true,
      data: newProduct
    };
  });
}

/**
 * Actualizar producto (admin)
 */
export async function fake_updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<ApiResponse<Product>> {
  return fakeFetch(() => {
    const products = initProducts();
    const index = products.findIndex((p) => p.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Producto no encontrado'
        }
      };
    }

    const updatedProduct: Product = {
      ...products[index],
      ...updates,
      id, // Mantener ID original
      updatedAt: new Date().toISOString()
    };

    products[index] = updatedProduct;
    saveProducts(products);

    return {
      success: true,
      data: updatedProduct
    };
  });
}

/**
 * Desactivar producto (soft delete)
 */
export async function fake_deactivateProduct(id: string): Promise<ApiResponse<void>> {
  return fakeFetch(() => {
    const products = initProducts();
    const index = products.findIndex((p) => p.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Producto no encontrado'
        }
      };
    }

    products[index].isActive = false;
    products[index].updatedAt = new Date().toISOString();
    saveProducts(products);

    return {
      success: true
    };
  });
}

/**
 * Reactivar producto
 */
export async function fake_activateProduct(id: string): Promise<ApiResponse<void>> {
  return fakeFetch(() => {
    const products = initProducts();
    const index = products.findIndex((p) => p.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Producto no encontrado'
        }
      };
    }

    products[index].isActive = true;
    products[index].updatedAt = new Date().toISOString();
    saveProducts(products);

    return {
      success: true
    };
  });
}
