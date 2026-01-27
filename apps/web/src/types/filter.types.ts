/**
 * Filter State Types
 * Extends ProductFilters with UI-specific state
 */

import { ProductFilters } from './index';

export type SortOption =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'featured';

export type ViewMode = 'grid' | 'list';

export interface FilterState extends ProductFilters {
  // UI State
  isOpen: boolean; // Mobile filters drawer
  sortBy: SortOption;
  viewMode: ViewMode;
}

export interface FilterActions {
  setSearch: (search: string) => void;
  setCategoryId: (categoryId: string | undefined) => void;
  setBrandId: (brandId: string | undefined) => void;
  setPriceRange: (min: number | undefined, max: number | undefined) => void;
  setFeatured: (featured: boolean | undefined) => void;
  setSortBy: (sortBy: SortOption) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleFilters: () => void;
  resetFilters: () => void;
}
