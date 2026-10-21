import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { StoreSettings } from '@/types';

const LOGO_HEIGHT = 40;

interface StoreLogoProps {
  settings?: StoreSettings | null;
  className?: string;
}

/**
 * Logo configurable desde admin (Configuración). Sin logo cargado, o si la
 * API no respondió, muestra el nombre en texto.
 */
export function StoreLogo({ settings, className }: StoreLogoProps) {
  if (!settings?.logoUrl) {
    return <span className={cn('text-xl font-bold text-primary', className)}>Valplas</span>;
  }

  const width =
    settings.logoWidth && settings.logoHeight
      ? Math.round((settings.logoWidth / settings.logoHeight) * LOGO_HEIGHT)
      : LOGO_HEIGHT;

  return (
    <Image
      src={settings.logoUrl}
      alt="Valplas"
      width={width}
      height={LOGO_HEIGHT}
      loading="eager"
      className={cn('h-10 w-auto max-w-[140px] object-contain sm:max-w-[200px]', className)}
    />
  );
}
