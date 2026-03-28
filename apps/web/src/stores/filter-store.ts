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
  categoryId: undefined,
  brandId: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  isFeatured: undefined,
  isActive: true, // Only show active products by default

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
    set({ categoryId });
  },

  setBrandId: (brandId) => {
    set({ brandId });
  },

  setPriceRange: (min, max) => {
    set({
      minPrice: min,
      maxPrice: max
    });
  },

  setFeatured: (featured) => {
    set({ isFeatured: featured });
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
      categoryId: undefined,
      brandId: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      isFeatured: undefined,
      sortBy: 'featured'
    });
  }
}));
