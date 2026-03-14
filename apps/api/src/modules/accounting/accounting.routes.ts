import { Router } from 'express';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { getDailySummaryHandler } from './accounting.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/daily-summary', requireRole(['admin', 'owner']), getDailySummaryHandler);

export default router;
