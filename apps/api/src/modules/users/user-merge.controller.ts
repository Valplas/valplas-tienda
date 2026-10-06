// apps/api/src/modules/users/user-merge.controller.ts

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import * as mergeDomain from './user-merge.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * GET /api/users/:id/merge-preview?source_user_id=
 */
export async function getMergePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = await mergeDomain.previewMerge(
      req.params.id as string,
      req.query.source_user_id as string
    );
    return res.json(ApiResponse.success(preview));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/:id/merge
 */
export async function mergeUser(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;
    const result = await mergeDomain.mergeUsers(
      req.params.id as string,
      req.body.source_user_id,
      adminId
    );
    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/users/merge-suggestions?page=&limit=
 */
export async function getMergeSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { suggestions, total } = await mergeDomain.getMergeSuggestions(page, limit);
    return res.json(ApiResponse.paginated(suggestions, page, limit, total));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/merge-suggestions/dismiss
 */
export async function dismissMergeSuggestion(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;
    await mergeDomain.dismissSuggestion(req.body.user_id, req.body.legacy_user_id, adminId);
    return res.json(ApiResponse.success({ dismissed: true }));
  } catch (error) {
    next(error);
  }
}
