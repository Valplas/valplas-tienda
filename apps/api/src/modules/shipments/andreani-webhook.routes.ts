// apps/api/src/modules/shipments/andreani-webhook.routes.ts
//
// Server-to-server: se autentica con Basic auth propio. NO montar authMiddleware ni leer cookies
// (la ruta está exenta de CSRF y del rate limiter general).

import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/error.middleware.js';
import { handleAndreaniPush } from './andreani-webhook.controller.js';

const router = Router();

router.post('/', asyncHandler(handleAndreaniPush));

export default router;
