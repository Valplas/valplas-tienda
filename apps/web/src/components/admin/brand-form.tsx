'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { brandSchema, type BrandFormData } from '@/lib/validations/brand';
import { Brand } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { generateSlug } from '@/lib/utils';
import { useEffect } from 'react';

interface BrandFormProps {
  brand?: Brand;
  onSubmit: (data: BrandFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function BrandForm({ brand, onSubmit, onCancel, isLoading }: BrandFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: brand
      ? {
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url ?? '',
          description: brand.description ?? '',
          is_active: brand.is_active
        }
      : {
          name: '',
          slug: '',
          logo_url: '',
          description: '',
          is_active: true
        }
  });

  const name = useWatch({ control, name: 'name' });
  const slug = useWatch({ control, name: 'slug' });

  // Auto-generate slug from name
  useEffect(() => {
    if (!brand && name && !slug) {
      setValue('slug', generateSlug(name));
    }
  }, [name, slug, brand, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input id="name" {...register('name')} placeholder="Ej: Philips" disabled={isLoading} />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Slug */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="slug">
          Slug <span className="text-red-500">*</span>
        </Label>
        <Input id="slug" {...register('slug')} placeholder="philips" disabled={isLoading} />
        {errors.slug && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.slug.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Se genera automáticamente. Solo minúsculas, números y guiones.
        </p>
      </div>

      {/* Logo URL */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="logo_url">URL del Logo</Label>
        <Input
          id="logo_url"
          {...register('logo_url')}
          placeholder="https://ejemplo.com/logo.png"
          disabled={isLoading}
        />
        {errors.logo_url && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.logo_url.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Descripción opcional de la marca"
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
          Marca activa
        </Label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : brand ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
