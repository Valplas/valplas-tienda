import { Router } from 'express';
import * as productController from './product.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { validateQuery } from '../../shared/middleware/validate.middleware.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole
} from '../../shared/middleware/auth.middleware.js';
import {
  productFiltersSchema,
  createProductSchema,
  updateProductSchema
} from './product.validator.js';
import priceTierRouter, { productTierRouter } from './price-tiers/price-tier.routes.js';
import { stagingRouter, productImagesRouter } from './images/product-image.routes.js';

const router = Router();

/**
 * GET /api/products
 * Listar productos con filtros (público)
 */
// Los filtros van en el query string. validateQuery guarda el resultado
// parseado (snake_case normalizado a camelCase) en req.validated.query;
// en Express 5 req.query es un getter y no se puede reasignar.
// optionalAuthMiddleware: la ruta es pública, pero admin/owner pueden
// filtrar por is_active (ver productos desactivados).
router.get(
  '/',
  optionalAuthMiddleware,
  validateQuery(productFiltersSchema),
  productController.listProducts
);

/**
 * GET /api/products/slug/:slug
 * Obtener producto por slug (público)
 * NOTA: Esta ruta debe ir antes de /:id para evitar conflictos
 */
router.get('/slug/:slug', productController.getProductBySlug);

/**
 * /api/products/price-tiers/bulk-* — bulk assignment operations
 * Must be mounted before /:id to avoid "price-tiers" being treated as an ID
 */
router.use('/price-tiers', priceTierRouter);

/**
 * /api/products/:id/price-tiers — per-product tier management
 */
router.use('/:id/price-tiers', productTierRouter);

/**
 * /api/products/images/staging/* — staged image upload (create-flow, sin
 * producto todavía). Debe ir antes de /:id para que "images" no choque con
 * el param de id.
 */
router.use('/images', stagingRouter);

/**
 * /api/products/:id/images — gestión de imágenes de un producto existente
 * (edit-flow: upload directo, borrar, reordenar/set-primary)
 */
router.use('/:id/images', productImagesRouter);

/**
 * GET /api/products/:id
 * Obtener producto por ID (público)
 */
router.get('/:id', productController.getProductById);

/**
 * POST /api/products
 * Crear producto (admin/owner)
 */
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createProductSchema),
  productController.createProduct
);

/**
 * PUT /api/products/:id
 * Actualizar producto (admin/owner)
 */
router.put(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateProductSchema),
  productController.updateProduct
);

/**
 * DELETE /api/products/:id
 * Eliminar producto (admin/owner)
 */
router.delete(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  productController.deleteProduct
);

export default router;
