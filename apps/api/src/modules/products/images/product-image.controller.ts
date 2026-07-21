import type { Request, Response, NextFunction } from 'express';
import * as productImageService from './product-image.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../../shared/utils/api-response.js';

/**
 * POST /api/products/images/staging/:tempId
 * Subir imagen a staging (create-flow, sin producto todavía)
 */
export async function stageImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { tempId } = req.params;
    const image = await productImageService.stageImageUpload(tempId as string, req.file!);
    return res.status(201).json(ApiResponse.success({ image }));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/products/:id/images
 * Subir imagen directo a un producto existente (edit-flow)
 */
export async function uploadDirectImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { altText } = req.body as { altText?: string };
    const image = await productImageService.uploadDirectImage(id as string, req.file!, altText);
    return res.status(201).json(ApiResponse.success({ image }));
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/products/:id/images/:imageId
 */
export async function deleteImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, imageId } = req.params;
    await productImageService.deleteImage(id as string, imageId as string);
    return res.json(ApiResponse.success({ message: 'Imagen eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/products/:id/images/order
 * Reordenar imágenes / cambiar principal
 */
export async function reorderImages(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { imageIds } = req.body as { imageIds: string[] };
    const images = await productImageService.reorderImages(id as string, imageIds);
    return res.json(ApiResponse.success({ images }));
  } catch (error) {
    next(error);
  }
}
