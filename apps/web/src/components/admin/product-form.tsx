'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Product, Category, Brand } from '@/types';
import { productSchema, type ProductFormData } from '@/lib/validations/product';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { LoadingButton } from '@/components/ui/loading-button';
import { Button } from '@/components/ui/button';
import { ImageUpload } from '@/components/admin/image-upload';
import { cn } from '@/lib/utils';
import { getCategories, getBrands } from '@/services';

export interface ProductFormProps {
  product?: Product;
  onSubmit: (data: ProductFormData & { images?: string[] }) => Promise<void>;
  onCancel?: () => void;
}

export function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [images, setImages] = React.useState<string[]>(product?.images || []);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [isLoadingData, setIsLoadingData] = React.useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku,
          description: product.description,
          base_price: product.base_price,
          stock: product.stock,
          category_id: product.category_id,
          brand_id: product.brand_id,
          unit: product.unit,
          is_featured: product.is_featured,
          is_active: product.is_active
        }
      : {
          is_featured: false,
          is_active: true,
          base_price: 0,
          stock: 0
        }
  });

  const categoryId = watch('category_id');
  const brandId = watch('brand_id');
  const isFeatured = watch('is_featured');
  const isActive = watch('is_active');

  // Load categories and brands on mount
  React.useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const [categoriesData, brandsRes] = await Promise.all([getCategories(), getBrands()]);

        setCategories(categoriesData.filter((c) => c.is_active));

        if (brandsRes.success && brandsRes.data) {
          setBrands(brandsRes.data.filter((b) => b.is_active));
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, []);

  const handleFormSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...data,
        images
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Información Básica</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Nombre del Producto"
            required
            error={errors.name?.message}
            {...register('name')}
          />

          <FormField
            label="SKU"
            required
            error={errors.sku?.message}
            helperText="Código único (se convertirá a mayúsculas automáticamente)"
            {...register('sku')}
          />
        </div>

        <FormField
          label="Descripción"
          required
          as="textarea"
          rows={4}
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Precio Base"
            type="number"
            step="0.01"
            required
            error={errors.base_price?.message}
            {...register('base_price', { valueAsNumber: true })}
          />

          <FormField
            label="Stock"
            type="number"
            required
            error={errors.stock?.message}
            {...register('stock', { valueAsNumber: true })}
          />

          <FormField
            label="Unidad"
            placeholder="ej: unidad, pack x 10"
            error={errors.unit?.message}
            {...register('unit')}
          />
        </div>
      </div>

      {/* Category and Brand */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Clasificación</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Category */}
          <div className="relative pb-5">
            <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">
              Categoría
            </Label>
            <Select value={categoryId} onValueChange={(value) => setValue('category_id', value)}>
              <SelectTrigger
                className={cn(
                  errors.category_id && 'border-destructive focus-visible:ring-destructive'
                )}
              >
                <SelectValue placeholder="Seleccioná una categoría" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingData ? (
                  <div className="p-2 text-sm text-muted-foreground">Cargando...</div>
                ) : (
                  categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.category_id && (
              <p className="absolute top-full left-0 text-xs text-destructive mt-1">
                {errors.category_id.message}
              </p>
            )}
          </div>

          {/* Brand */}
          <div className="relative pb-5">
            <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">Marca</Label>
            <Select value={brandId} onValueChange={(value) => setValue('brand_id', value)}>
              <SelectTrigger
                className={cn(
                  errors.brand_id && 'border-destructive focus-visible:ring-destructive'
                )}
              >
                <SelectValue placeholder="Seleccioná una marca" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingData ? (
                  <div className="p-2 text-sm text-muted-foreground">Cargando...</div>
                ) : (
                  brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.brand_id && (
              <p className="absolute top-full left-0 text-xs text-destructive mt-1">
                {errors.brand_id.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Images */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Imágenes</h2>
        <ImageUpload value={images} onChange={setImages} maxImages={5} />
      </div>

      {/* Options */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Opciones</h2>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_featured"
              checked={isFeatured}
              onCheckedChange={(checked) => setValue('is_featured', !!checked)}
            />
            <Label
              htmlFor="is_featured"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Producto destacado
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked) => setValue('is_active', !!checked)}
            />
            <Label
              htmlFor="is_active"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Producto activo
            </Label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-6 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <LoadingButton type="submit" loading={isSubmitting}>
          {product ? 'Actualizar Producto' : 'Crear Producto'}
        </LoadingButton>
      </div>
    </form>
  );
}
