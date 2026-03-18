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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (category_id && !UUID_REGEX.test(category_id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAM', message: 'category_id must be a valid UUID' }
      });
      return;
    }

    if (brand_id && !UUID_REGEX.test(brand_id)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAM', message: 'brand_id must be a valid UUID' }
      });
      return;
    }

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
