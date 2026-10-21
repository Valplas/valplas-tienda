'use client';

import * as React from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingButton } from '@/components/ui/loading-button';
import { StoreLogo } from '@/components/layout/store-logo';
import { ImageCropDialog, type CropAspectOption } from '@/components/admin/image-crop-dialog';
import { ACCEPTED_IMAGE_TYPES, getImageFileError } from '@/lib/image-files';
import { deleteStoreLogo, uploadStoreLogo } from '@/lib/services/settings.service';
import type { StoreSettings } from '@/types';

// El server guarda hasta 800×400
const LOGO_MAX_WIDTH = 800;

const LOGO_ASPECTS: CropAspectOption[] = [
  { label: 'Como está', value: 'original' },
  { label: 'Horizontal 3:1', value: 3 },
  { label: 'Horizontal 2:1', value: 2 },
  { label: 'Cuadrado', value: 1 }
];

interface LogoUploaderProps {
  settings: StoreSettings;
  onChange: (settings: StoreSettings) => void;
}

export function LogoUploader({ settings, onChange }: LogoUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const closeDialog = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const fileError = getImageFileError(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    setPending({ file, url: URL.createObjectURL(file) });
  };

  const handleCropConfirm = async (cropped: File) => {
    closeDialog();
    setUploading(true);
    try {
      onChange(await uploadStoreLogo(cropped));
      toast.success('Logo actualizado. Ya se ve en la tienda.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al subir el logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      onChange(await deleteStoreLogo());
      toast.success('Logo quitado. La tienda muestra el nombre en texto.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al quitar el logo');
    } finally {
      setRemoving(false);
    }
  };

  const busy = uploading || removing;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Vista previa con el mismo alto y fondo que el header */}
      <div className="rounded-md border">
        <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
          Así se ve arriba a la izquierda
        </p>
        <div className="flex h-16 items-center bg-background px-4">
          <StoreLogo settings={settings} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="button"
          onClick={() => inputRef.current?.click()}
          loading={uploading}
          loadingText="Subiendo..."
          disabled={busy}
        >
          <ImagePlus className="h-4 w-4" />
          {settings.logoUrl ? 'Cambiar logo' : 'Subir logo'}
        </LoadingButton>
        {settings.logoUrl && (
          <LoadingButton
            type="button"
            variant="outline"
            onClick={handleRemove}
            loading={removing}
            loadingText="Quitando..."
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            Quitar logo
          </LoadingButton>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Recomendado: PNG con fondo transparente, horizontal. Se muestra a 40px de alto. Sin logo, la
        tienda muestra el nombre en texto.
      </p>

      {pending && (
        <ImageCropDialog
          key={pending.url}
          src={pending.url}
          fileName={pending.file.name}
          aspectOptions={LOGO_ASPECTS}
          outputType="image/png"
          maxOutputWidth={LOGO_MAX_WIDTH}
          title="Recortar logo"
          description="Elegí la forma y dejá el logo sin bordes de más. La transparencia se conserva."
          onCancel={closeDialog}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
