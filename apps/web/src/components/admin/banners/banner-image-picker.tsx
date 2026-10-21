'use client';

import * as React from 'react';
import Image from 'next/image';
import { ImagePlus, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/admin/image-crop-dialog';
import { cropImageCenterToFile } from '@/lib/crop-image';
import { ACCEPTED_IMAGE_TYPES, getImageFileError } from '@/lib/image-files';
import { BANNER_ASPECT } from '@/lib/banners';
import type { BannerImages } from '@/lib/services/banners.service';

// Anchos máximos de salida: el server guarda PC hasta 2000px y celular hasta 1200px
const DESKTOP_MAX_WIDTH = 2000;
const MOBILE_MAX_WIDTH = 1200;

interface BannerImagePickerProps {
  /** Imágenes ya guardadas (edición) */
  currentDesktopUrl?: string | null;
  currentMobileUrl?: string | null;
  onChange: (images: BannerImages) => void;
  disabled?: boolean;
  error?: string;
}

type Step = 'desktop' | 'mobile';

interface PendingSource {
  file: File;
  url: string;
  desktop?: File;
}

/**
 * Una foto, dos recortes: primero cómo se ve en computadora (ancho) y después
 * en celular (más alto). El de celular se puede dejar automático (centrado).
 */
export function BannerImagePicker({
  currentDesktopUrl,
  currentMobileUrl,
  onChange,
  disabled,
  error
}: BannerImagePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingSource | null>(null);
  const [step, setStep] = React.useState<Step>('desktop');
  const [autoCropping, setAutoCropping] = React.useState(false);
  // Object URLs de los recortes elegidos (se crean en el handler, no en un effect)
  const [pickedPreview, setPickedPreview] = React.useState<{
    desktop: string;
    mobile: string | null;
  } | null>(null);
  const pickedPreviewRef = React.useRef(pickedPreview);

  React.useEffect(() => {
    return () => {
      const preview = pickedPreviewRef.current;
      if (preview) {
        URL.revokeObjectURL(preview.desktop);
        if (preview.mobile) URL.revokeObjectURL(preview.mobile);
      }
    };
  }, []);

  const desktopPreview = pickedPreview?.desktop ?? currentDesktopUrl ?? null;
  const mobilePreview = (pickedPreview ? pickedPreview.mobile : currentMobileUrl) ?? desktopPreview;

  const closeDialog = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
    setStep('desktop');
  };

  const finish = (images: BannerImages) => {
    const previous = pickedPreviewRef.current;
    if (previous) {
      URL.revokeObjectURL(previous.desktop);
      if (previous.mobile) URL.revokeObjectURL(previous.mobile);
    }
    const next = {
      desktop: URL.createObjectURL(images.desktop),
      mobile: images.mobile ? URL.createObjectURL(images.mobile) : null
    };
    pickedPreviewRef.current = next;
    setPickedPreview(next);
    onChange(images);
    closeDialog();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;

    const fileError = getImageFileError(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }

    setStep('desktop');
    setPending({ file, url: URL.createObjectURL(file) });
  };

  const handleDesktopConfirm = (desktop: File) => {
    setPending((prev) => (prev ? { ...prev, desktop } : prev));
    setStep('mobile');
  };

  const handleMobileConfirm = (mobile: File) => {
    if (!pending?.desktop) return;
    finish({ desktop: pending.desktop, mobile });
  };

  const handleAutoMobile = async () => {
    if (!pending?.desktop || autoCropping) return;
    setAutoCropping(true);
    try {
      const mobile = await cropImageCenterToFile(
        pending.url,
        BANNER_ASPECT.mobile,
        pending.file.name,
        { maxWidth: MOBILE_MAX_WIDTH }
      );
      finish({ desktop: pending.desktop, mobile });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar la imagen');
    } finally {
      setAutoCropping(false);
    }
  };

  const hasImage = Boolean(desktopPreview);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={handleFileSelected}
      />

      {hasImage ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <figure className="space-y-1">
            <div className="relative aspect-[3/1] overflow-hidden rounded-md border bg-muted">
              <Image
                src={desktopPreview!}
                alt=""
                fill
                sizes="(min-width: 640px) 400px, 100vw"
                className="object-cover"
                unoptimized
              />
            </div>
            <figcaption className="flex items-center gap-1 text-xs text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" /> Computadora
            </figcaption>
          </figure>
          <figure className="w-40 space-y-1">
            <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
              <Image
                src={mobilePreview!}
                alt=""
                fill
                sizes="160px"
                className="object-cover"
                unoptimized
              />
            </div>
            <figcaption className="flex items-center gap-1 text-xs text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" /> Celular
            </figcaption>
          </figure>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex aspect-[3/1] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm font-medium">Elegir foto del banner</span>
        </button>
      )}

      {hasImage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <ImagePlus className="h-4 w-4" />
          Cambiar foto
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        JPEG, PNG, WebP o AVIF, hasta 10MB. Ideal: foto horizontal de al menos 2000px de ancho. Vas
        a elegir cómo se ve en computadora y en celular.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {pending && step === 'desktop' && (
        <ImageCropDialog
          key={`${pending.url}-desktop`}
          src={pending.url}
          fileName={pending.file.name}
          aspect={BANNER_ASPECT.desktop}
          maxOutputWidth={DESKTOP_MAX_WIDTH}
          title="Paso 1 de 2 · Cómo se ve en computadora"
          description="Arrastrá la foto y usá el zoom para elegir qué parte se ve en pantallas anchas."
          onCancel={closeDialog}
          onConfirm={handleDesktopConfirm}
        />
      )}

      {pending && step === 'mobile' && (
        <ImageCropDialog
          key={`${pending.url}-mobile`}
          src={pending.url}
          fileName={pending.file.name}
          aspect={BANNER_ASPECT.mobile}
          maxOutputWidth={MOBILE_MAX_WIDTH}
          title="Paso 2 de 2 · Cómo se ve en celular"
          description="En el celular el banner es más alto. Elegí qué parte de la foto se ve."
          onCancel={closeDialog}
          onConfirm={handleMobileConfirm}
          secondaryAction={{
            label: autoCropping ? 'Procesando...' : 'Centrar automáticamente',
            onClick: handleAutoMobile
          }}
        />
      )}
    </div>
  );
}
