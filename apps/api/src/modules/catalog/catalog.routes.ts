import { Router } from 'express';
import * as catalogController from './catalog.controller.js';

const router = Router();

/**
 * GET /api/catalog/products
 * Productos públicos con tiers de precio. Sin autenticación.
 */
router.get('/products', catalogController.listProducts);

export default router;
