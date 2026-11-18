import type { Request, Response, NextFunction } from 'express';
import * as brandService from './brand.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

export async function listBrands(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, isActive, page, cursor, limit = '24' } = req.query;

    const parsedPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = parseInt(limit as string, 10);
    const filters = {
      search: search as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      // Sin page se pagina por cursor
      page:
        parsedPage === undefined ? undefined : isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
      cursor: cursor as string | undefined,
      limit: isNaN(parsedLimit) || parsedLimit < 1 ? 24 : Math.min(parsedLimit, 100)
    };

    const result = await brandService.listBrands(filters);

    // data es la lista; la paginación va al nivel superior como en el resto de los listados
    if (result.keyset) {
      return res.json(
        ApiResponse.paginated(result.data, {
          limit: filters.limit,
          hasMore: result.hasMore,
          cursor: result.nextCursor ?? undefined,
          total: result.total ?? undefined
        })
      );
    }
    const total = result.total ?? 0;
    return res.json(
      ApiResponse.paginated(result.data, {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
        hasMore: (filters.page ?? 1) * filters.limit < total
      })
    );
  } catch (error) {
    next(error);
  }
}

export async function getBrandById(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.getBrandById(req.params.id as string as string);
    return res.json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function getBrandBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const brand = await brandService.getBrandBySlug(req.params.slug as string);
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
    const brand = await brandService.updateBrand(req.params.id as string as string, req.body);
    return res.json(ApiResponse.success({ brand }));
  } catch (error) {
    next(error);
  }
}

export async function deleteBrand(req: Request, res: Response, next: NextFunction) {
  try {
    await brandService.deleteBrand(req.params.id as string as string);
    return res.json(ApiResponse.success({ message: 'Marca eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}
