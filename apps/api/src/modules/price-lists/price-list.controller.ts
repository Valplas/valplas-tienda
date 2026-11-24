import type { Request, Response, NextFunction } from 'express';
import * as service from './price-list.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

export async function listPriceLists(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, isActive, page, cursor, limit = '50' } = req.query;

    const parsedPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = parseInt(limit as string, 10);
    const filters = {
      search: search as string | undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      // Sin page se pagina por cursor
      page:
        parsedPage === undefined ? undefined : isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
      cursor: cursor as string | undefined,
      limit: isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, 100)
    };

    const result = await service.listPriceLists(filters);

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

export async function getPriceListById(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.getPriceListById(req.params.id as string);
    return res.json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function createPriceList(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.createPriceList(req.body);
    return res.status(201).json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function updatePriceList(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.updatePriceList(req.params.id as string, req.body);
    return res.json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function deletePriceList(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deletePriceList(req.params.id as string);
    return res.json(ApiResponse.success({ message: 'Lista de precios eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}

export async function calculatePrice(req: Request, res: Response, next: NextFunction) {
  try {
    const { product_id } = req.query;

    if (!product_id || typeof product_id !== 'string') {
      return res.status(400).json(ApiResponse.error('VALIDATION_ERROR', 'product_id es requerido'));
    }

    const result = await service.calculatePrice(req.params.id as string, product_id);

    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}
