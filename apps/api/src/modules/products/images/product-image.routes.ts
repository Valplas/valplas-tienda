import { Router } from 'express';
import * as controller from './product-image.controller.js';
import { validate } from '../../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import { apiRateLimiter } from '../../../shared/middleware/rate-limit.middleware.js';
import { uploadSingleImage } from './image-upload.middleware.js';
import {
  tempIdParamSchema,
  productIdParamSchema,
  productImageParamsSchema,
  uploadImageBodySchema,
  reorderImagesSchema
} from './product-image.validator.js';

/**
 * Staging router (create-flow): mounted at /api/products/images.
 * Debe montarse antes de /:id en product.routes.ts para que "images" no se
 * interprete como un id de producto.
 */
const stagingRouter = Router();
stagingRouter.use(apiRateLimiter);

stagingRouter.post(
  '/staging/:tempId',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(tempIdParamSchema, 'params'),
  uploadSingleImage, // multer primero: puebla req.file/req.body desde el multipart stream
  controller.stageImage
);

export { stagingRouter };

/**
 * Per-product images router (edit-flow): mounted at /api/products/:id/images
 * con mergeParams para acceder a :id.
 */
const productImagesRouter = Router({ mergeParams: true });
productImagesRouter.use(apiRateLimiter);

productImagesRouter.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(productIdParamSchema, 'params'),
  uploadSingleImage,
  validate(uploadImageBodySchema), // después de multer: recién ahí req.body tiene los campos de texto
  controller.uploadDirectImage
);

productImagesRouter.delete(
  '/:imageId',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(productImageParamsSchema, 'params'),
  controller.deleteImage
);

productImagesRouter.put(
  '/order',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(productIdParamSchema, 'params'),
  validate(reorderImagesSchema),
  controller.reorderImages
);

export { productImagesRouter };
