export interface DashboardRecentOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  user: { first_name: string; last_name: string } | null;
}

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  sku: string;
  available_stock: number;
}

export interface DashboardStats {
  active_products: number;
  total_orders: number;
  pending_orders: number;
  month_revenue: number;
  low_stock_threshold: number;
  low_stock_count: number;
  low_stock_products: DashboardLowStockProduct[];
  recent_orders: DashboardRecentOrder[];
}
