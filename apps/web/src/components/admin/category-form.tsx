'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categorySchema, type CategoryFormData } from '@/lib/validations/category';
import { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { generateSlug } from '@/lib/utils';
import { getDescendantIds } from '@/lib/utils/tree';
import { useEffect } from 'react';

interface CategoryFormProps {
  category?: Category;
  allCategories: Category[];
  onSubmit: (data: CategoryFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CategoryForm({
  category,
  allCategories,
  onSubmit,
  onCancel,
  isLoading
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? {
          name: category.name,
          slug: category.slug,
          parent_id: category.parent_id,
          display_order: category.display_order,
          description: category.description ?? '',
          is_active: category.is_active,
          image_url: category.image_url ?? ''
        }
      : {
          name: '',
          slug: '',
          parent_id: null,
          display_order: 0,
          description: '',
          is_active: true,
          image_url: ''
        }
  });

  const name = useWatch({ control, name: 'name' });
  const slug = useWatch({ control, name: 'slug' });

  // Auto-generate slug from name
  useEffect(() => {
    if (!category && name && !slug) {
      setValue('slug', generateSlug(name));
    }
  }, [name, slug, category, setValue]);

  // Get available parent categories (exclude self and descendants)
  const availableParents = allCategories.filter((c) => {
    if (!category) return true; // All available when creating

    // Exclude self
    if (c.id === category.id) return false;

    // Exclude descendants
    const descendants = getDescendantIds(allCategories, category.id);
    return !descendants.includes(c.id);
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Artículos Plásticos"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Slug */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="slug">
          Slug <span className="text-red-500">*</span>
        </Label>
        <Input
          id="slug"
          {...register('slug')}
          placeholder="articulos-plasticos"
          disabled={isLoading}
        />
        {errors.slug && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.slug.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Se genera automáticamente. Solo minúsculas, números y guiones.
        </p>
      </div>

      {/* Parent Category */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="parent_id">Categoría Padre</Label>
        <Select
          value={watch('parent_id') ?? 'none'}
          onValueChange={(value) => setValue('parent_id', value === 'none' ? null : value)}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin categoría padre (raíz)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin categoría padre (raíz)</SelectItem>
            {availableParents.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.parent_id && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.parent_id.message}</p>
        )}
      </div>

      {/* Display Order */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="display_order">Orden de Visualización</Label>
        <Input
          id="display_order"
          type="number"
          {...register('display_order', { valueAsNumber: true })}
          placeholder="0"
          disabled={isLoading}
          min={0}
        />
        {errors.display_order && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.display_order.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Número menor aparece primero. Por defecto: 0
        </p>
      </div>

      {/* Image URL */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="image_url">URL de la Imagen</Label>
        <Input
          id="image_url"
          {...register('image_url')}
          placeholder="https://ejemplo.com/imagen.jpg"
          disabled={isLoading}
        />
        {errors.image_url && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.image_url.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Descripción opcional de la categoría"
          rows={3}
          disabled={isLoading}
        />
        {errors.description && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.description.message}</p>
        )}
      </div>

      {/* Is Active */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={watch('is_active')}
          onCheckedChange={(checked) => setValue('is_active', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Categoría activa
        </Label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : category ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
