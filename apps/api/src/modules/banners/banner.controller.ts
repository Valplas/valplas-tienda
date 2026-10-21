import type { Request, Response, NextFunction } from 'express';
import * as bannerService from './banner.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import type { UploadedImageFields } from '../../shared/middleware/image-upload.middleware.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { BannerFiles } from './banner.service.js';
import type { BannerPagination } from './banner.types.js';
import type {
  CreateBannerInput,
  ReorderBannersInput,
  UpdateBannerInput
} from './banner.validator.js';

// uploadImageFields ya garantizó desktop_image (required)
function getBannerFiles(req: Request): BannerFiles {
  const files = req.files as UploadedImageFields;
  return { desktop: files.desktop_image![0], mobile: files.mobile_image?.[0] };
}

export async function listPublicBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = req.validated!.query as BannerPagination;
    const result = await bannerService.listPublicBanners(pagination);
    return res.json(
      ApiResponse.paginated(result.data, pagination.page, pagination.limit, result.total)
    );
  } catch (error) {
    next(error);
  }
}

export async function listAdminBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = req.validated!.query as BannerPagination;
    const result = await bannerService.listAdminBanners(pagination);
    return res.json(
      ApiResponse.paginated(result.data, pagination.page, pagination.limit, result.total)
    );
  } catch (error) {
    next(error);
  }
}

export async function createBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const banner = await bannerService.createBanner(
      req.validated!.body as CreateBannerInput,
      getBannerFiles(req),
      userId
    );
    return res.status(201).json(ApiResponse.success({ banner }));
  } catch (error) {
    next(error);
  }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const banner = await bannerService.updateBanner(
      req.params.id as string,
      req.validated!.body as UpdateBannerInput
    );
    return res.json(ApiResponse.success({ banner }));
  } catch (error) {
    next(error);
  }
}

export async function replaceBannerImages(req: Request, res: Response, next: NextFunction) {
  try {
    const banner = await bannerService.replaceBannerImages(
      req.params.id as string,
      getBannerFiles(req)
    );
    return res.json(ApiResponse.success({ banner }));
  } catch (error) {
    next(error);
  }
}

export async function reorderBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const { banner_ids } = req.body as ReorderBannersInput;
    await bannerService.reorderBanners(banner_ids);
    return res.json(ApiResponse.success({ message: 'Orden actualizado' }));
  } catch (error) {
    next(error);
  }
}

export async function deleteBanner(req: Request, res: Response, next: NextFunction) {
  try {
    await bannerService.deleteBanner(req.params.id as string);
    return res.json(ApiResponse.success({ message: 'Banner eliminado exitosamente' }));
  } catch (error) {
    next(error);
  }
}
