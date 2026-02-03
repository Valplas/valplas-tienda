import { Router } from 'express';
import * as categoryController from './category.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema
} from './category.validator.js';

const router = Router();

router.get('/', categoryController.listCategories);
router.get('/:id', categoryController.getCategoryById);
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createCategorySchema),
  categoryController.createCategory
);
router.put(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateCategorySchema),
  categoryController.updateCategory
);
router.delete(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  categoryController.deleteCategory
);
router.patch(
  '/reorder',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(reorderCategoriesSchema),
  categoryController.reorderCategories
);

export default router;
