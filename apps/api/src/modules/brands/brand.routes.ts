import { Router } from 'express';
import * as brandController from './brand.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { createBrandSchema, updateBrandSchema } from './brand.validator.js';

const router = Router();

router.get('/', brandController.listBrands);
router.get('/slug/:slug', brandController.getBrandBySlug);
router.get('/:id', brandController.getBrandById);
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createBrandSchema),
  brandController.createBrand
);
router.put(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateBrandSchema),
  brandController.updateBrand
);
router.delete(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  brandController.deleteBrand
);

export default router;
