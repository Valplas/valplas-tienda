import { Router } from 'express';
import * as controller from './price-tier.controller.js';
import { validate } from '../../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import { apiRateLimiter } from '../../../shared/middleware/rate-limit.middleware.js';
import { bulkPreviewSchema, bulkConfirmSchema } from './price-tier.validator.js';

/**
 * Bulk price-tier operations router.
 * Mounted at /api/products/price-tiers (before /:id routes to avoid conflicts).
 */
const bulkRouter = Router();
bulkRouter.use(apiRateLimiter);

bulkRouter.post(
  '/bulk-preview',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(bulkPreviewSchema),
  controller.bulkPreview
);

bulkRouter.post(
  '/bulk-confirm',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(bulkConfirmSchema),
  controller.bulkConfirm
);

export { bulkRouter };

/**
 * Per-product price-tier router.
 * Mounted at /api/products/:id/price-tiers with mergeParams so :id is accessible.
 */
import { replaceProductTiersSchema } from './price-tier.validator.js';

const productTierRouter = Router({ mergeParams: true });
productTierRouter.use(apiRateLimiter);

productTierRouter.get('/', controller.getProductTiers);

productTierRouter.put(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(replaceProductTiersSchema),
  controller.replaceProductTiers
);

export { productTierRouter };
export default bulkRouter;
