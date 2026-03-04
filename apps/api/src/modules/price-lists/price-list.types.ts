import type { PriceList } from '@valplas/shared/types';

export interface PriceListFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreatePriceListData {
  name: string;
  margin: number;
  discount: number;
  isActive: boolean;
}

export interface UpdatePriceListData {
  name?: string;
  margin?: number;
  discount?: number;
  isActive?: boolean;
}

export interface PriceListCalculation {
  costPrice: number;
  margin: number;
  unitPrice: number;
}

export type { PriceList };
