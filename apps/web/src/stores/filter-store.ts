/**
 * Filter Store - Zustand
 * Manages catalog filters and sorting state
 */

import { create } from 'zustand';
import { FilterState, FilterActions } from '@/types/filter.types';

type FilterStore = FilterState & FilterActions;

const initialState: FilterState = {
  // ProductFilters
  search: undefined,
  category_id: undefined,
  brand_id: undefined,
  min_price: undefined,
  max_price: undefined,
  is_featured: undefined,
  is_active: true, // Only show active products by default

  // UI State
  isOpen: false,
  sortBy: 'featured',
  viewMode: 'grid'
};

export const useFilterStore = create<FilterStore>((set) => ({
  ...initialState,

  // Actions
  setSearch: (search) => {
    set({ search: search || undefined });
  },

  setCategoryId: (categoryId) => {
    set({ category_id: categoryId });
  },

  setBrandId: (brandId) => {
    set({ brand_id: brandId });
  },

  setPriceRange: (min, max) => {
    set({
      min_price: min,
      max_price: max
    });
  },

  setFeatured: (featured) => {
    set({ is_featured: featured });
  },

  setSortBy: (sortBy) => {
    set({ sortBy });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  toggleFilters: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  resetFilters: () => {
    set({
      search: undefined,
      category_id: undefined,
      brand_id: undefined,
      min_price: undefined,
      max_price: undefined,
      is_featured: undefined,
      sortBy: 'featured'
    });
  }
}));
