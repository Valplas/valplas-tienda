import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { StoreSettings } from '@/types';

// height: alto intrínseco (px) para calcular el ancho; las clases fijan el alto
// mostrado y el texto de fallback en cada tamaño.
const SIZES = {
  header: {
    height: 40,
    image: 'h-10 max-w-[140px] sm:max-w-[200px]',
    text: 'text-xl'
  },
  hero: {
    height: 128,
    image: 'h-24 max-w-full sm:h-32 sm:max-w-[400px]',
    text: 'text-2xl tracking-tight sm:text-4xl'
  }
} as const;

interface StoreLogoProps {
  settings?: StoreSettings | null;
  /** header: barra superior (40px); hero: inicio, sin banners */
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Logo configurable desde admin (Configuración). Sin logo cargado, o si la
 * API no respondió, muestra el nombre en texto.
 */
export function StoreLogo({ settings, size = 'header', className }: StoreLogoProps) {
  const { height, image, text } = SIZES[size];

  if (!settings?.logoUrl) {
    return <span className={cn('font-bold text-primary', text, className)}>Valplas</span>;
  }

  const width =
    settings.logoWidth && settings.logoHeight
      ? Math.round((settings.logoWidth / settings.logoHeight) * height)
      : height;

  return (
    <Image
      src={settings.logoUrl}
      alt="Valplas"
      width={width}
      height={height}
      loading="eager"
      className={cn('w-auto object-contain', image, className)}
    />
  );
}
