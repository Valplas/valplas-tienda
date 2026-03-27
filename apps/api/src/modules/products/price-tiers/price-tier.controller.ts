import type { Request, Response, NextFunction } from 'express';
import * as service from './price-tier.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../../shared/utils/api-response.js';

export async function getProductTiers(req: Request, res: Response, next: NextFunction) {
  try {
    const tiers = await service.getTiersByProduct(req.params['id'] as string);
    return res.json(ApiResponse.success({ tiers }));
  } catch (error) {
    next(error);
  }
}

export async function replaceProductTiers(req: Request, res: Response, next: NextFunction) {
  try {
    const tiers = await service.replaceProductTiers(req.params['id'] as string, req.body.tiers);
    return res.json(ApiResponse.success({ tiers }));
  } catch (error) {
    next(error);
  }
}

export async function bulkPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.bulkPreview(req.body);
    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}

export async function bulkConfirm(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.bulkConfirm(req.body);
    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}
