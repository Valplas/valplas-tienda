'use client';

import * as React from 'react';
import Image from 'next/image';
import { X, Upload, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProductImage } from '@/types';
import {
  stageProductImage,
  uploadProductImage,
  deleteProductImage,
  reorderProductImages
} from '@/services';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export interface ImageUploadProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  maxImages?: number;
  /** Edit-flow: el producto ya existe, upload/delete/reorder van directo al server. */
  productId?: string;
  /** Create-flow: no hay producto todavía, el upload va a staging. */
  tempId?: string;
  className?: string;
}

export function ImageUpload({
  images,
  onChange,
  maxImages = 5,
  productId,
  tempId,
  className
}: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Loading state por imagen (no un boolean compartido): cada slot en upload
  // se rastrea por su propia key, así uploads concurrentes no se pisan.
  const [uploadingKeys, setUploadingKeys] = React.useState<string[]>([]);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo

    if (!file) return;
    if (images.length + uploadingKeys.length >= maxImages) {
      toast.error(`Máximo ${maxImages} imágenes`);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Formato no soportado (usar JPEG, PNG, WebP o AVIF)');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('El archivo supera el límite de 10MB');
      return;
    }

    const key = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setPreviews((prev) => ({ ...prev, [key]: previewUrl }));
    setUploadingKeys((prev) => [...prev, key]);

    try {
      if (productId) {
        const image = await uploadProductImage(productId, file);
        onChange([...images, image]);
      } else if (tempId) {
        const staged = await stageProductImage(tempId, file);
        const localImage: ProductImage = {
          id: staged.tempPath, // sin fila real todavía — el path de staging sirve de key estable
          url: staged.url,
          altText: null,
          displayOrder: images.length,
          isPrimary: images.length === 0,
          width: staged.width,
          height: staged.height
        };
        onChange([...images, localImage]);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir la imagen');
    } finally {
      setUploadingKeys((prev) => prev.filter((k) => k !== key));
      setPreviews((prev) => {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
      URL.revokeObjectURL(previewUrl);
    }
  };

  const handleRemove = async (image: ProductImage) => {
    if (productId) {
      try {
        await deleteProductImage(productId, image.id);
      } catch (error) {
        console.error('Error deleting image:', error);
        toast.error(error instanceof Error ? error.message : 'Error al eliminar la imagen');
        return;
      }
    }
    // Create-flow (staged, sin productId todavía): el objeto queda huérfano
    // en Storage y el cron de limpieza lo barre a las 24h — no hace falta
    // avisarle al backend acá.
    onChange(images.filter((img) => img.id !== image.id));
  };

  const handleSetPrimary = async (image: ProductImage) => {
    const reordered = [image, ...images.filter((img) => img.id !== image.id)];

    if (productId) {
      try {
        const updated = await reorderProductImages(
          productId,
          reordered.map((img) => img.id)
        );
        onChange(updated);
      } catch (error) {
        console.error('Error reordering images:', error);
        toast.error(error instanceof Error ? error.message : 'Error al reordenar las imágenes');
      }
      return;
    }

    // Create-flow: sin producto todavía, reordenamos solo localmente — el
    // orden final se manda como tempImageOrder al crear el producto.
    onChange(
      reordered.map((img, index) => ({ ...img, displayOrder: index, isPrimary: index === 0 }))
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image) => (
          <div
            key={image.id}
            className="relative group aspect-square rounded-lg border bg-muted overflow-hidden"
          >
            <Image
              src={image.url}
              alt={image.altText ?? 'Imagen de producto'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {!image.isPrimary && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => handleSetPrimary(image)}
                  className="h-8 w-8"
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => handleRemove(image)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {image.isPrimary && (
              <div className="absolute top-2 left-2 bg-primary-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" />
                <span>Principal</span>
              </div>
            )}
          </div>
        ))}

        {uploadingKeys.map((key) => (
          <div
            key={key}
            className="relative aspect-square rounded-lg border bg-muted overflow-hidden"
          >
            {previews[key] && (
              // unoptimized: blob: URLs son locales a esta pestaña, el
              // optimizador de next/image no puede hacerles fetch.
              <Image
                src={previews[key]}
                alt="Subiendo..."
                fill
                unoptimized
                className="object-cover opacity-50"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          </div>
        ))}

        {images.length + uploadingKeys.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'aspect-square rounded-lg border-2 border-dashed',
              'flex flex-col items-center justify-center gap-2',
              'text-muted-foreground hover:text-foreground hover:border-primary-400',
              'transition-colors cursor-pointer'
            )}
          >
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Agregar imagen</span>
            <span className="text-xs">
              ({images.length + uploadingKeys.length}/{maxImages})
            </span>
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        JPEG, PNG, WebP o AVIF — máximo 10MB por imagen.
        {images.length > 1 && ' Hacé clic en la estrella para cambiar la imagen principal.'}
      </p>
    </div>
  );
}
