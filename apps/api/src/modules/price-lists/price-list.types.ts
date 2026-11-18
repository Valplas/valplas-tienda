import type { PriceList } from '@valplas/shared/types';

export interface PriceListFilters {
  search?: string;
  isActive?: boolean;
  /** Paginación clásica (OFFSET). Si se omite, se pagina por cursor. */
  page?: number;
  /** Cursor opaco de la página anterior. */
  cursor?: string;
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
