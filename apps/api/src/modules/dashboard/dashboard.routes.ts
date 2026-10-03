import { Router } from 'express';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { getDashboardStatsHandler } from './dashboard.controller.js';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Métricas del dashboard admin
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Productos activos, pedidos, ventas del mes, stock bajo y pedidos recientes
 */
router.get('/stats', requireRole(['admin', 'owner']), getDashboardStatsHandler);

export default router;
