import { AppError } from '../../shared/middleware/error.middleware.js';
import { transaction } from '../../infrastructure/database/client.js';
import * as productRepository from './product.repository.js';
import * as productImageService from './images/product-image.service.js';
import type {
  ProductFilters,
  ProductWithDetails,
  CreateProductData,
  UpdateProductData
} from './product.types.js';

/**
 * Resuelve el filtro de visibilidad según rol. Solo admin y owner pueden
 * ver productos inactivos (o "todos"); cualquier otro rol —o anónimo—
 * queda forzado a solo activos aunque mande is_active en el query.
 */
export function resolveIsActiveFilter(
  role: string | undefined,
  requested: boolean | undefined
): boolean | undefined {
  const canSeeInactive = role === 'admin' || role === 'owner';
  return canSeeInactive ? requested : true;
}

/**
 * Listar productos con filtros y paginación
 */
export async function listProducts(filters: ProductFilters) {
  const { products, total } = await productRepository.findProducts(filters);

  const page = filters.page || 1;
  const limit = filters.limit || 24;
  const totalPages = Math.ceil(total / limit);

  return {
    products,
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
 * Obtener producto por ID
 */
export async function getProductById(id: string): Promise<ProductWithDetails> {
  const product = await productRepository.findProductById(id);

  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  return product;
}

/**
 * Obtener producto por slug
 */
export async function getProductBySlug(slug: string): Promise<ProductWithDetails> {
  const product = await productRepository.findProductBySlug(slug);

  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  return product;
}

/**
 * Crear producto
 */
export async function createProduct(data: CreateProductData): Promise<ProductWithDetails> {
  // Verificar que SKU no exista
  const skuExists = await productRepository.skuExists(data.sku);
  if (skuExists) {
    throw new AppError('SKU_ALREADY_EXISTS', 'El SKU ya existe', 400);
  }

  // Verificar que slug no exista
  const slugExists = await productRepository.slugExists(data.slug);
  if (slugExists) {
    throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
  }

  // Crear producto y, si viene tempId, finalizar las imágenes en staging
  // (mover de temp/{tempId}/ a products/{id}/ + insertar filas) en la misma
  // transacción — ver product-image.service.ts#finalizeStagedImages.
  const product = await transaction(async (client) => {
    const created = await productRepository.createProduct(data, client);
    if (data.tempId) {
      await productImageService.finalizeStagedImages(
        client,
        data.tempId,
        created.id,
        data.tempImageOrder
      );
    }
    return created;
  });

  // Retornar producto con detalles
  return getProductById(product.id);
}

/**
 * Actualizar producto
 */
export async function updateProduct(
  id: string,
  data: UpdateProductData
): Promise<ProductWithDetails> {
  // Verificar que el producto existe
  await getProductById(id);

  // Si se actualiza el slug, verificar que no exista
  if (data.slug) {
    const slugExists = await productRepository.slugExists(data.slug, id);
    if (slugExists) {
      throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
    }
  }

  // Actualizar producto
  const updated = await productRepository.updateProduct(id, data);

  if (!updated) {
    throw new AppError('PRODUCT_UPDATE_FAILED', 'No se pudo actualizar el producto', 500);
  }

  // Retornar producto actualizado con detalles
  return getProductById(id);
}

/**
 * Eliminar producto (soft delete)
 */
export async function deleteProduct(id: string): Promise<void> {
  // Verificar que el producto existe
  await getProductById(id);

  // Soft delete
  const deleted = await productRepository.deleteProduct(id);

  if (!deleted) {
    throw new AppError('PRODUCT_DELETE_FAILED', 'No se pudo eliminar el producto', 500);
  }
}
