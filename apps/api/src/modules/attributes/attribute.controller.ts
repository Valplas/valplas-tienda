import type { Request, Response, NextFunction } from 'express';
import * as attributeService from './attribute.service.js';
import { listAttributesQuerySchema } from './attribute.validator.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

export async function listAttributes(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = listAttributesQuerySchema.parse(req.query);
    const result = await attributeService.listAttributes(page, limit);
    return res.json(
      ApiResponse.paginated(result.data, {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
        hasMore: page * limit < result.total
      })
    );
  } catch (error) {
    next(error);
  }
}

export async function createAttribute(req: Request, res: Response, next: NextFunction) {
  try {
    const attribute = await attributeService.createAttribute(req.body);
    return res.status(201).json(ApiResponse.success({ attribute }));
  } catch (error) {
    next(error);
  }
}

export async function updateAttribute(req: Request, res: Response, next: NextFunction) {
  try {
    const attribute = await attributeService.updateAttribute(req.params.id as string, req.body);
    return res.json(ApiResponse.success({ attribute }));
  } catch (error) {
    next(error);
  }
}

export async function deleteAttribute(req: Request, res: Response, next: NextFunction) {
  try {
    await attributeService.deleteAttribute(req.params.id as string);
    return res.json(ApiResponse.success({ message: 'Atributo eliminado exitosamente' }));
  } catch (error) {
    next(error);
  }
}

export async function setCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await attributeService.setCategories(
      req.params.id as string,
      req.body.category_ids
    );
    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}

export async function listForCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const attributes = await attributeService.listForCategory(req.params.categoryId as string);
    return res.json(ApiResponse.success(attributes));
  } catch (error) {
    next(error);
  }
}
