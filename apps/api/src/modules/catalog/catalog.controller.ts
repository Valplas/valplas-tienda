import type { Request, Response, NextFunction } from 'express';
import * as catalogRepository from './catalog.repository.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * GET /api/catalog/products
 * Lista pública de productos con tiers de precio. Sin autenticación requerida.
 */
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      search,
      category_id,
      brand_id,
      page = '1',
      limit = '20'
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const result = await catalogRepository.findPublicProducts({
      search,
      category_id,
      brand_id,
      page: pageNum,
      limit: limitNum
    });

    return res.json(
      ApiResponse.paginated(result.products, {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
        hasMore: pageNum * limitNum < result.total
      })
    );
  } catch (error) {
    next(error);
  }
}
