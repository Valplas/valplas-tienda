import { get } from '../api';
import type { OrderStatus } from './orders.service';

export interface DashboardRecentOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
}

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  sku: string;
  availableStock: number;
}

export interface DashboardStats {
  activeProducts: number;
  totalOrders: number;
  pendingOrders: number;
  monthRevenue: number;
  lowStockThreshold: number;
  lowStockCount: number;
  lowStockProducts: DashboardLowStockProduct[];
  recentOrders: DashboardRecentOrder[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await get<DashboardStats>('/dashboard/stats');
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al cargar métricas');
  return res.data;
}
