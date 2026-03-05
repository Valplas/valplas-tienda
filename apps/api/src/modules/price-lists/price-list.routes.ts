import { Router } from 'express';
import * as controller from './price-list.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { apiRateLimiter } from '../../shared/middleware/rate-limit.middleware.js';
import { createPriceListSchema, updatePriceListSchema } from './price-list.validator.js';

const router = Router();

router.use(apiRateLimiter);

// GET /:id/calculate MUST be registered before /:id to avoid Express treating "calculate" as an ID
router.get(
  '/:id/calculate',
  authMiddleware,
  requireRole(['admin', 'owner']),
  controller.calculatePrice
);

router.get('/', authMiddleware, requireRole(['admin', 'owner']), controller.listPriceLists);
router.get('/:id', authMiddleware, requireRole(['admin', 'owner']), controller.getPriceListById);
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createPriceListSchema),
  controller.createPriceList
);
router.patch(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updatePriceListSchema),
  controller.updatePriceList
);
router.delete('/:id', authMiddleware, requireRole(['admin', 'owner']), controller.deletePriceList);

export default router;
