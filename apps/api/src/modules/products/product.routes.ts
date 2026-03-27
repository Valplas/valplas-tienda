import { Router } from 'express';
import * as productController from './product.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  productFiltersSchema,
  createProductSchema,
  updateProductSchema
} from './product.validator.js';
import priceTierRouter, { productTierRouter } from './price-tiers/price-tier.routes.js';

const router = Router();

/**
 * GET /api/products
 * Listar productos con filtros (público)
 */
router.get('/', validate(productFiltersSchema), productController.listProducts);

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
