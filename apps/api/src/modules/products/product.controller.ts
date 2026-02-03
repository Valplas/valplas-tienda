import type { Request, Response, NextFunction } from 'express';
import * as productService from './product.service.js';
import { ApiResponse } from '../../shared/utils/api-response.js';

/**
 * GET /api/products
 * Listar productos con filtros
 */
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = req.query;
    const result = await productService.listProducts(filters);

    return res.json(
      ApiResponse.paginated(result.products, {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        hasMore: result.pagination.hasMore
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/:id
 * Obtener producto por ID
 */
export async function getProductById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const product = await productService.getProductById(id);

    return res.json(ApiResponse.success({ product }));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/products/slug/:slug
 * Obtener producto por slug
 */
export async function getProductBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const product = await productService.getProductBySlug(slug);

    return res.json(ApiResponse.success({ product }));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/products
 * Crear producto (admin)
 */
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.createProduct(req.body);

    return res.status(201).json(ApiResponse.success({ product }));
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/products/:id
 * Actualizar producto (admin)
 */
export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const product = await productService.updateProduct(id, req.body);

    return res.json(ApiResponse.success({ product }));
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/products/:id
 * Eliminar producto (admin)
 */
export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await productService.deleteProduct(id);

    return res.json(
      ApiResponse.success({
        message: 'Producto eliminado exitosamente'
      })
    );
  } catch (error) {
    next(error);
  }
}
