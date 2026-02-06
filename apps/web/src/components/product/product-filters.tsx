/**
 * Product Filters Component
 * Panel with search, category, brand, and price range filters
 */

'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useFilterStore } from '@/stores/filter-store';
import { useDebounce } from '@/hooks/use-debounce';
import { getCategories, getBrands } from '@/services';
import { Category, Brand } from '@/types';
import { cn } from '@/lib/utils';

interface ProductFiltersProps {
  className?: string;
}

export function ProductFilters({ className }: ProductFiltersProps) {
  // Filter store
  const search = useFilterStore((state) => state.search);
  const categoryId = useFilterStore((state) => state.category_id);
  const brandId = useFilterStore((state) => state.brand_id);
  const minPrice = useFilterStore((state) => state.min_price);
  const maxPrice = useFilterStore((state) => state.max_price);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchInput, setSearchInput] = useState(search || '');
  const [minPriceInput, setMinPriceInput] = useState(minPrice?.toString() || '');
  const [maxPriceInput, setMaxPriceInput] = useState(maxPrice?.toString() || '');

  const setSearch = useFilterStore((state) => state.setSearch);
  const setCategoryId = useFilterStore((state) => state.setCategoryId);
  const setBrandId = useFilterStore((state) => state.setBrandId);
  const setPriceRange = useFilterStore((state) => state.setPriceRange);
  const resetFilters = useFilterStore((state) => state.resetFilters);

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 300);

  // Load categories and brands
  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesData, brandsRes] = await Promise.all([getCategories(), getBrands()]);

        // getCategories returns data directly (not wrapped in ApiResponse)
        setCategories(categoriesData as any);

        if (brandsRes.success && brandsRes.data) {
          setBrands(brandsRes.data as any); // Type assertion for logo_url compatibility
        }
      } catch (error) {
        console.error('Error loading filters:', error);
      }
    };

    loadData();
  }, []);

  // Sync debounced search with store
  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  const handlePriceChange = () => {
    const min = minPriceInput ? parseFloat(minPriceInput) : undefined;
    const max = maxPriceInput ? parseFloat(maxPriceInput) : undefined;

    if (min !== undefined && max !== undefined && min > max) {
      // Swap if min > max
      setPriceRange(max, min);
    } else {
      setPriceRange(min, max);
    }
  };

  const handleReset = () => {
    resetFilters();
    setSearchInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
  };

  const hasActiveFilters =
    search || categoryId || brandId || minPrice !== undefined || maxPrice !== undefined;

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Filtros</h2>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 gap-1 text-xs">
            <X className="h-3 w-3" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="filter-search">Buscar</Label>
        <Input
          id="filter-search"
          placeholder="Nombre, descripción, SKU..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <Separator />

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="filter-category">Categoría</Label>
        <Select
          value={categoryId || 'all'}
          onValueChange={(v) => setCategoryId(v === 'all' ? undefined : v)}
        >
          <SelectTrigger id="filter-category">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Brand */}
      <div className="space-y-2">
        <Label htmlFor="filter-brand">Marca</Label>
        <Select
          value={brandId || 'all'}
          onValueChange={(v) => setBrandId(v === 'all' ? undefined : v)}
        >
          <SelectTrigger id="filter-brand">
            <SelectValue placeholder="Todas las marcas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Price Range */}
      <div className="space-y-3">
        <Label>Rango de precio</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="filter-min-price" className="text-xs text-muted-foreground">
              Mínimo
            </Label>
            <Input
              id="filter-min-price"
              type="number"
              placeholder="$ Min"
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value)}
              onBlur={handlePriceChange}
              min={0}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-max-price" className="text-xs text-muted-foreground">
              Máximo
            </Label>
            <Input
              id="filter-max-price"
              type="number"
              placeholder="$ Max"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              onBlur={handlePriceChange}
              min={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
