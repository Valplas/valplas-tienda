import type { Request, Response, NextFunction } from 'express';
import * as brandService from './brand.service.js';
import { ApiResponse } from '../../shared/utils/api-response.js';

export async function listBrands(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, isActive, page = '1', limit = '24' } = req.query;

    const filters = {
      search: search as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: parseInt(page as string, 10),
      limit: Math.min(parseInt(limit as string, 10), 100)
    };

    const result = await brandService.listBrands(filters);

    return res.json(
      ApiResponse.success({
        brands: result.data,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit),
          hasMore: filters.page * filters.limit < result.total
        }
      })
    );
  } catch (error) {
    next(error);
  }
}

export async function getBrandById(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.getBrandById(req.params.id);
    return res.json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function getBrandBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.getBrandBySlug(req.params.slug);
    return res.json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function createBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.createBrand(req.body);
    return res.status(201).json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function updateBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.updateBrand(req.params.id, req.body);
    return res.json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function deleteBrand(req: Request, res: Response, next: NextFunction) {
  try {
    await brandService.deleteBrand(req.params.id);
    return res.json(ApiResponse.success({ message: 'Marca eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}
