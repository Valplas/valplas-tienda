import type { Request, Response, NextFunction } from 'express';
import { getDashboardStats } from './dashboard.repository.js';

/**
 * GET /api/dashboard/stats
 * Métricas del dashboard admin: productos activos, pedidos, ventas del mes
 * (zona horaria Argentina), stock bajo y pedidos recientes.
 */
export async function getDashboardStatsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats();

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}
