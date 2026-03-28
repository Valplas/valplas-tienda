import { get } from '../api';

export interface PriceListSale {
  priceListId: string | null;
  priceListName: string | null;
  marginPercentage: number | null;
  quantitySold: number;
  ganancia: number;
}

export interface ProductDailySale {
  productId: string;
  productName: string;
  productSku: string;
  costPrice: number;
  availableStock: number;
  totalQuantity: number;
  totalGanancia: number;
  priceListSales: PriceListSale[];
}

export interface DailySummary {
  date: string;
  totalGanancia: number;
  products: ProductDailySale[];
}

export async function getDailySummary(date: string): Promise<DailySummary> {
  const res = await get<DailySummary>(`/accounting/daily-summary?date=${date}`);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al cargar resumen');
  return res.data;
}
