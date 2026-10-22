'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingButton } from '@/components/ui/loading-button';
import { bannerSchema, type BannerFormData } from '@/lib/validations/banner';
import { dateInputToEndOfDay, dateInputToStartOfDay, isoToDateInput } from '@/lib/banners';
import type { BannerImages, BannerPayload } from '@/lib/services/banners.service';
import type { AdminBanner } from '@/types';
import { BannerImagePicker } from './banner-image-picker';
import { BannerLinkPicker, type BannerLinkValue } from './banner-link-picker';

export interface BannerFormSubmit {
  payload: BannerPayload;
  /** null = no se cambiaron las imágenes (solo en edición) */
  images: BannerImages | null;
}

interface BannerFormProps {
  banner?: AdminBanner;
  onSubmit: (data: BannerFormSubmit) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function initialLink(banner?: AdminBanner): BannerLinkValue {
  return {
    brand:
      banner?.linkBrandId && banner.linkBrandName
        ? { id: banner.linkBrandId, name: banner.linkBrandName }
        : null,
    category:
      banner?.linkCategoryId && banner.linkCategoryName
        ? { id: banner.linkCategoryId, name: banner.linkCategoryName }
        : null,
    product:
      banner?.linkProductId && banner.linkProductName && banner.linkProductSlug
        ? { id: banner.linkProductId, name: banner.linkProductName, slug: banner.linkProductSlug }
        : null
  };
}

function Section({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function BannerForm({ banner, onSubmit, onCancel, isLoading }: BannerFormProps) {
  const [images, setImages] = React.useState<BannerImages | null>(null);
  const [imagesError, setImagesError] = React.useState<string | undefined>();
  const [link, setLink] = React.useState<BannerLinkValue>(() => initialLink(banner));

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<BannerFormData>({
    resolver: zodResolver(bannerSchema),
    defaultValues: {
      title: banner?.title ?? '',
      startsAt: isoToDateInput(banner?.startsAt ?? null),
      endsAt: isoToDateInput(banner?.endsAt ?? null),
      isActive: banner?.isActive ?? true
    }
  });

  const submit = async (data: BannerFormData) => {
    if (!banner && !images) {
      setImagesError('Elegí una foto para el banner');
      return;
    }

    await onSubmit({
      payload: {
        title: data.title,
        link_brand_id: link.brand?.id ?? null,
        link_category_id: link.category?.id ?? null,
        link_product_id: link.product?.id ?? null,
        is_active: data.isActive,
        starts_at: dateInputToStartOfDay(data.startsAt),
        ends_at: dateInputToEndOfDay(data.endsAt)
      },
      images
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-8">
      <Section title="Foto">
        <BannerImagePicker
          currentDesktopUrl={banner?.desktopImageUrl}
          currentMobileUrl={banner?.mobileImageUrl}
          onChange={(picked) => {
            setImages(picked);
            setImagesError(undefined);
          }}
          disabled={isLoading}
          error={imagesError}
        />
      </Section>

      <Section
        title="Nombre"
        description="Para reconocerlo en esta lista. No se muestra en la tienda."
      >
        <Input
          id="title"
          {...register('title')}
          placeholder="Ej: Promo verano piletas"
          disabled={isLoading}
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
      </Section>

      <Section
        title="¿Qué pasa cuando tocan el banner?"
        description="Elegí una marca, una categoría o las dos para mostrar esos productos. O elegí un producto para abrirlo directo."
      >
        <BannerLinkPicker value={link} onChange={setLink} disabled={isLoading} />
      </Section>

      <Section
        title="¿Cuándo se muestra?"
        description="Opcional. Dejá las fechas vacías para mostrarlo siempre."
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="startsAt">Desde</Label>
            <Input id="startsAt" type="date" {...register('startsAt')} disabled={isLoading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endsAt">Hasta (inclusive)</Label>
            <Input id="endsAt" type="date" {...register('endsAt')} disabled={isLoading} />
          </div>
        </div>
        {errors.endsAt && <p className="text-sm text-red-500">{errors.endsAt.message}</p>}

        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor="isActive" className="cursor-pointer">
                  Mostrar en la tienda
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apagalo para ocultarlo sin borrarlo.
                </p>
              </div>
              <Switch
                id="isActive"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isLoading}
              />
            </div>
          )}
        />
      </Section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <LoadingButton type="submit" loading={isLoading} loadingText="Guardando...">
          {banner ? 'Guardar cambios' : 'Crear banner'}
        </LoadingButton>
      </div>
    </form>
  );
}
