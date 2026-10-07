'use client';

import * as React from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { RotateCcw, RotateCw, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cropImageToFile } from '@/lib/crop-image';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const MAX_STRAIGHTEN = 45;

export interface ImageCropDialogProps {
  /** Object URL de la imagen elegida */
  src: string;
  fileName: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

/**
 * Editor previo al upload: recorte cuadrado, zoom, giro de a 90° y
 * enderezado fino. Devuelve la imagen ya recortada como JPEG.
 * Montarlo con key={src} para que cada imagen arranque sin edición previa.
 */
export function ImageCropDialog({ src, fileName, onCancel, onConfirm }: ImageCropDialogProps) {
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(MIN_ZOOM);
  const [quarterTurns, setQuarterTurns] = React.useState(0);
  const [straighten, setStraighten] = React.useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [loading, setLoading] = React.useState(false);

  const rotation = quarterTurns * 90 + straighten;

  const handleCropComplete = React.useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const file = await cropImageToFile(src, croppedAreaPixels, rotation, fileName);
      onConfirm(file);
    } catch (error) {
      console.error('Error cropping image:', error);
      toast.error(error instanceof Error ? error.message : 'Error al procesar la imagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onCancel();
      }}
    >
      <DialogContent className="max-w-xl gap-4 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Editar imagen</DialogTitle>
          <DialogDescription>
            Arrastrá para encuadrar. La imagen se guarda en formato cuadrado.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted sm:h-96">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 shrink-0">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="flex items-center gap-3 text-sm">
            <RotateCw className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 shrink-0">Enderezar</span>
            <input
              type="range"
              min={-MAX_STRAIGHTEN}
              max={MAX_STRAIGHTEN}
              step={0.5}
              value={straighten}
              onChange={(e) => setStraighten(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
              {straighten}°
            </span>
          </label>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setQuarterTurns((t) => (t + 3) % 4)}
            >
              <RotateCcw className="h-4 w-4" />
              Girar izquierda
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setQuarterTurns((t) => (t + 1) % 4)}
            >
              <RotateCw className="h-4 w-4" />
              Girar derecha
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <LoadingButton
            type="button"
            onClick={handleConfirm}
            loading={loading}
            loadingText="Procesando..."
            disabled={!croppedAreaPixels}
          >
            Usar imagen
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
