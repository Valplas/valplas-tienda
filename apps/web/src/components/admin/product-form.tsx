'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Product, Category, Brand, ProductImage } from '@/types';
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
import {
  ProductAttributesSection,
  type AttributesState
} from '@/components/admin/product-attributes-section';
import { TagsInput } from '@/components/admin/tags-input';
import { toast } from 'sonner';
import type { ProductAttributeInput } from '@/services';
import { cn } from '@/lib/utils';
import { getCategories, getBrands } from '@/services';

const toNumber = (v: string) => (v === '' ? undefined : Number(v));
const toRequiredNumber = (v: string) => (v === '' ? NaN : Number(v));

/** Datos extra que el form maneja fuera de react-hook-form. */
export interface ProductFormExtras {
  tempId?: string;
  tempImageOrder?: string[];
  /** undefined = no tocar (los atributos no terminaron de cargar). */
  attributes?: ProductAttributeInput[];
  tags: string[];
}

export interface ProductFormProps {
  product?: Product;
  onSubmit: (data: ProductFormData & ProductFormExtras) => Promise<void>;
  onCancel?: () => void;
}

export function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [images, setImages] = React.useState<ProductImage[]>(product?.images || []);
  // Generado una sola vez por montaje — solo se usa en modo creación (product
  // no seteado) para la sesión de staging de imágenes antes de que el
  // producto exista. Ver components/admin/image-upload.tsx.
  const [tempId] = React.useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [tags, setTags] = React.useState<string[]>(product?.tags ?? []);
  const [attrState, setAttrState] = React.useState<AttributesState>({
    ready: false,
    inputs: [],
    invalidLabels: []
  });

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
          unitLabel: product.unitLabel ?? undefined,
          unitContentQuantity: product.unitContentQuantity ?? undefined,
          unitContentLabel: product.unitContentLabel ?? undefined,
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
    if (attrState.invalidLabels.length > 0) {
      toast.error('Hay características numéricas inválidas', {
        description: attrState.invalidLabels.join(', ')
      });
      return;
    }
    const attributes = attrState.ready ? attrState.inputs : undefined;
    setIsSubmitting(true);
    try {
      if (product) {
        // Edit-flow: las imágenes ya se persistieron directo contra el
        // producto real (ver ImageUpload) — no hay nada que mandar acá.
        await onSubmit({ ...data, attributes, tags });
      } else {
        // Create-flow: las imágenes están en staging bajo tempId; el orden
        // local (drag/estrella) se manda explícito porque Storage.list() no
        // lo garantiza.
        await onSubmit({
          ...data,
          attributes,
          tags,
          tempId,
          tempImageOrder: images.map((img) => img.id.split('/').pop() as string)
        });
      }
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
        </div>
      </div>

      {/* Características */}
      <ProductAttributesSection
        categoryId={categoryId}
        initialAttributes={product?.attributes}
        onChange={setAttrState}
      />

      {/* Tags */}
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">Tags de búsqueda</h2>
          <p className="text-sm text-muted-foreground">
            Sinónimos y palabras con las que los clientes pueden buscar este producto.
          </p>
        </div>
        <TagsInput
          aria-label="Tags de búsqueda"
          value={tags}
          onChange={setTags}
          disabled={isSubmitting}
        />
      </div>

      {/* Unidad de venta */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Unidad de venta</h2>
          <p className="text-sm text-muted-foreground">
            Cómo se vende la unidad y qué trae adentro. Ej.: paquete de 100 bolsas. Si lo dejás
            vacío se muestra &quot;Unidad&quot;.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField
            label="Nombre"
            placeholder="ej: paquete, caja"
            error={errors.unitLabel?.message}
            {...register('unitLabel')}
          />
          <FormField
            label="Cantidad de contenido"
            type="number"
            min={1}
            step="any"
            placeholder="ej: 100"
            error={errors.unitContentQuantity?.message}
            {...register('unitContentQuantity', { setValueAs: toNumber })}
          />
          <FormField
            label="Contenido"
            placeholder="ej: bolsas"
            error={errors.unitContentLabel?.message}
            {...register('unitContentLabel')}
          />
        </div>
      </div>

      {/* Imágenes */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Imágenes</h2>
        <ImageUpload
          images={images}
          onChange={setImages}
          maxImages={5}
          productId={product?.id}
          tempId={product ? undefined : tempId}
        />
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
