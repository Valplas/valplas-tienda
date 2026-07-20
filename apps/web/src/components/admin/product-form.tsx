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
import { PriceTiersSection } from '@/components/admin/price-tiers-section';
import { cn } from '@/lib/utils';
import { getCategories, getBrands } from '@/services';

const toNumber = (v: string) => (v === '' ? undefined : Number(v));
const toRequiredNumber = (v: string) => (v === '' ? NaN : Number(v));

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
          costPrice: product.costPrice || undefined,
          stock: product.stock,
          categoryId: product.categoryId,
          brandId: product.brandId,
          unit: product.unit,
          weight: product.weight ?? undefined,
          width: product.width ?? undefined,
          length: product.length ?? undefined,
          height: product.height ?? undefined,
          origin: product.origin ?? undefined,
          isFeatured: product.isFeatured,
          isActive: product.isActive
        }
      : {
          isFeatured: false,
          isActive: true,
          stock: 0
        }
  });

  const categoryId = watch('categoryId');
  const brandId = watch('brandId');
  const isFeatured = watch('isFeatured');
  const isActive = watch('isActive');
  const costPriceValue = watch('costPrice');

  React.useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const [categoriesData, brandsData] = await Promise.all([getCategories(), getBrands()]);
        setCategories(categoriesData.filter((c) => c.isActive));
        setBrands(brandsData.filter((b) => b.isActive));
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
      {/* Información del Producto */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Información del Producto</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Nombre"
            placeholder="Nombre del producto"
            required
            error={errors.name?.message}
            {...register('name')}
          />

          <FormField
            label="Descripción"
            placeholder="Descripción del producto"
            required
            error={errors.description?.message}
            {...register('description')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Marca */}
          <div className="relative pb-5">
            <Label>Fabricante</Label>
            <Select value={brandId} onValueChange={(value) => setValue('brandId', value)}>
              <SelectTrigger
                className={cn(
                  errors.brandId && 'border-destructive focus-visible:ring-destructive'
                )}
              >
                <SelectValue placeholder="Fabricante del producto" />
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
            {errors.brandId && (
              <p className="absolute top-full left-0 text-xs text-destructive mt-1">
                {errors.brandId.message}
              </p>
            )}
          </div>

          <FormField
            label="Código"
            placeholder="Código del producto"
            error={errors.sku?.message}
            helperText="Se convertirá a mayúsculas automáticamente"
            {...register('sku')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Precio de costo"
            type="number"
            step="0.01"
            placeholder="Costo de compra"
            required
            error={errors.costPrice?.message}
            helperText="El precio de venta sale del costo + margen de la lista asignada"
            {...register('costPrice', { setValueAs: toRequiredNumber })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Peso (kg)"
            type="number"
            step="0.001"
            placeholder="Peso en kg"
            error={errors.weight?.message}
            {...register('weight', { setValueAs: toNumber })}
          />

          <FormField
            label="Ancho"
            type="number"
            step="0.01"
            placeholder="Ancho en cm"
            error={errors.width?.message}
            {...register('width', { setValueAs: toNumber })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Largo"
            type="number"
            step="0.01"
            placeholder="Largo en cm"
            error={errors.length?.message}
            {...register('length', { setValueAs: toNumber })}
          />

          <FormField
            label="Alto"
            type="number"
            step="0.01"
            placeholder="Alto en cm"
            error={errors.height?.message}
            {...register('height', { setValueAs: toNumber })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Origen"
            placeholder="Origen del producto"
            error={errors.origin?.message}
            {...register('origin')}
          />

          <FormField
            label="Cantidad"
            type="number"
            placeholder="Cantidad"
            required
            error={errors.stock?.message}
            {...register('stock', { setValueAs: toRequiredNumber })}
          />
        </div>
      </div>

      {/* Clasificación */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Clasificación</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Categoría */}
          <div className="relative pb-5">
            <Label className="after:content-['*'] after:ml-0.5 after:text-destructive">
              Categoría
            </Label>
            <Select value={categoryId} onValueChange={(value) => setValue('categoryId', value)}>
              <SelectTrigger
                className={cn(
                  errors.categoryId && 'border-destructive focus-visible:ring-destructive'
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
            {errors.categoryId && (
              <p className="absolute top-full left-0 text-xs text-destructive mt-1">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          <FormField
            label="Unidad"
            placeholder="ej: unidad, pack x 10"
            error={errors.unit?.message}
            {...register('unit')}
          />
        </div>
      </div>

      {/* Imágenes */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Imágenes</h2>
        <ImageUpload value={images} onChange={setImages} maxImages={5} />
      </div>

      {/* Opciones */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Opciones</h2>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isFeatured"
              checked={isFeatured}
              onCheckedChange={(checked) => setValue('isFeatured', !!checked)}
            />
            <Label
              htmlFor="isFeatured"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Producto destacado
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setValue('isActive', !!checked)}
            />
            <Label
              htmlFor="isActive"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Producto activo
            </Label>
          </div>
        </div>
      </div>

      {/* Price Tiers */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Tiers de precio</h3>
        <PriceTiersSection
          productId={product?.id}
          costPrice={Number.isFinite(costPriceValue) ? costPriceValue : product?.costPrice}
        />
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
