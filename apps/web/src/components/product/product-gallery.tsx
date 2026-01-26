/**
 * Product Gallery Component
 * Main image with thumbnail navigation
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  className?: string;
}

export function ProductGallery({ images, productName, className }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Ensure we have at least one image
  const imageList = images.length > 0 ? images : ['/placeholder.png'];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Image */}
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <Image
          src={imageList[selectedIndex]}
          alt={`${productName} - imagen ${selectedIndex + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority={selectedIndex === 0}
        />
      </div>

      {/* Thumbnails */}
      {imageList.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {imageList.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                'relative aspect-square overflow-hidden rounded-md border-2 transition-colors',
                selectedIndex === index
                  ? 'border-primary'
                  : 'border-transparent hover:border-muted-foreground'
              )}
            >
              <Image
                src={image}
                alt={`${productName} - miniatura ${index + 1}`}
                fill
                className="object-cover"
                sizes="100px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
