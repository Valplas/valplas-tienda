import { get } from '../api';

export interface PriceListSale {
  price_list_id: string | null;
  price_list_name: string | null;
  margin_percentage: number | null;
  quantity_sold: number;
  ganancia: number;
}

export interface ProductDailySale {
  product_id: string;
  product_name: string;
  product_sku: string;
  cost_price: number;
  available_stock: number;
  total_quantity: number;
  total_ganancia: number;
  price_list_sales: PriceListSale[];
}

export interface DailySummary {
  date: string;
  total_ganancia: number;
  products: ProductDailySale[];
}

export async function getDailySummary(date: string): Promise<DailySummary> {
  const res = await get<DailySummary>(`/accounting/daily-summary?date=${date}`);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al cargar resumen');
  return res.data;
}
