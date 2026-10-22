import type { Request, Response, NextFunction } from 'express';
import * as settingsService from './settings.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.getPublicSettings();
    return res.json(ApiResponse.success({ settings }));
  } catch (error) {
    next(error);
  }
}

export async function uploadLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const settings = await settingsService.uploadLogo(req.file!, userId);
    return res.json(ApiResponse.success({ settings }));
  } catch (error) {
    next(error);
  }
}

export async function deleteLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const settings = await settingsService.deleteLogo(userId);
    return res.json(ApiResponse.success({ settings }));
  } catch (error) {
    next(error);
  }
}
