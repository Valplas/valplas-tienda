import type { Brand } from '@valplas/shared/types';

export interface BrandWithCount extends Brand {
  productCount: number;
}

export interface CreateBrandData {
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateBrandData {
  name?: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
  isActive?: boolean;
}

export interface BrandFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
