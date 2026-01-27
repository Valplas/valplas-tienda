'use client';

import * as React from 'react';
import Image from 'next/image';
import { X, Upload, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ImageUploadProps {
  value?: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  className?: string;
}

export function ImageUpload({ value = [], onChange, maxImages = 5, className }: ImageUploadProps) {
  const [images, setImages] = React.useState<string[]>(value);
  const [primaryIndex, setPrimaryIndex] = React.useState(0);

  React.useEffect(() => {
    setImages(value);
  }, [value]);

  const handleAddImage = () => {
    if (images.length >= maxImages) return;

    // Mock: Generate placeholder image URL
    const mockImageUrl = `https://placehold.co/400x400/e5e7eb/6b7280?text=Producto+${images.length + 1}`;
    const newImages = [...images, mockImageUrl];
    setImages(newImages);
    onChange(newImages);
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onChange(newImages);

    // Adjust primary index if needed
    if (primaryIndex >= newImages.length) {
      setPrimaryIndex(Math.max(0, newImages.length - 1));
    } else if (index < primaryIndex) {
      setPrimaryIndex(primaryIndex - 1);
    }
  };

  const handleSetPrimary = (index: number) => {
    setPrimaryIndex(index);
    // Move image to first position
    const newImages = [...images];
    const [primaryImage] = newImages.splice(index, 1);
    newImages.unshift(primaryImage);
    setImages(newImages);
    onChange(newImages);
    setPrimaryIndex(0);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <div
            key={index}
            className="relative group aspect-square rounded-lg border bg-muted overflow-hidden"
          >
            <Image
              src={image}
              alt={`Producto ${index + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />

            {/* Overlay actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {index !== 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => handleSetPrimary(index)}
                  className="h-8 w-8"
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => handleRemoveImage(index)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Primary badge */}
            {index === 0 && (
              <div className="absolute top-2 left-2 bg-primary-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" />
                <span>Principal</span>
              </div>
            )}
          </div>
        ))}

        {/* Add image button */}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={handleAddImage}
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
              ({images.length}/{maxImages})
            </span>
          </button>
        )}
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Hacé clic en el botón para agregar imágenes mock. La primera imagen será la principal.
        {images.length > 1 && ' Hacé clic en la estrella para cambiar la imagen principal.'}
      </p>
    </div>
  );
}
