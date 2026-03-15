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
