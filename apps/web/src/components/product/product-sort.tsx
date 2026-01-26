/**
 * Product Sort Component
 * Dropdown selector for sort options
 */

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useFilterStore } from '@/stores/filter-store';
import { SortOption } from '@/types/filter.types';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'featured', label: 'Destacados' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'name_asc', label: 'Nombre: A-Z' },
  { value: 'name_desc', label: 'Nombre: Z-A' },
  { value: 'newest', label: 'Más recientes' }
];

export function ProductSort() {
  const sortBy = useFilterStore((state) => state.sortBy);
  const setSortBy = useFilterStore((state) => state.setSortBy);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Ordenar por:</span>
      <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
