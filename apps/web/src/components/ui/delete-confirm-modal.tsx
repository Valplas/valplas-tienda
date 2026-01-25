'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './alert-dialog';
import { LoadingButton } from './loading-button';
import { cn } from '@/lib/utils';

export interface DeleteConfirmItem {
  id: string;
  name: string;
}

export interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DeleteConfirmItem[];
  onConfirm: () => Promise<void>;
  itemType?: string;
  countdownSeconds?: number;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  onOpenChange,
  items,
  onConfirm,
  itemType = 'elemento',
  countdownSeconds
}) => {
  const [loading, setLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const isMultiple = items.length > 1;
  const shouldCountdown = isMultiple && (countdownSeconds ?? 3) > 0;
  const initialCountdown = shouldCountdown ? (countdownSeconds ?? 3) : 0;

  // Initialize countdown when dialog opens
  React.useEffect(() => {
    if (open && shouldCountdown) {
      setCountdown(initialCountdown);
    } else {
      setCountdown(null);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [open, shouldCountdown, initialCountdown]);

  // Countdown timer
  React.useEffect(() => {
    if (countdown !== null && countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [countdown]);

  const handleConfirm = async () => {
    if (countdown !== null && countdown > 0) return;

    try {
      setLoading(true);
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error during deletion:', error);
    } finally {
      setLoading(false);
    }
  };

  const itemsText = isMultiple
    ? `${items.length} ${itemType}${items.length > 1 ? 's' : ''}`
    : items[0]?.name || itemType;

  const isConfirmDisabled = loading || (countdown !== null && countdown > 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isMultiple ? 'Confirmar eliminación múltiple' : 'Confirmar eliminación'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {isMultiple
                  ? `Estás por eliminar ${itemsText}. Esta acción no se puede deshacer.`
                  : `¿Estás seguro de que querés eliminar "${itemsText}"? Esta acción no se puede deshacer.`}
              </p>

              {isMultiple && items.length <= 10 && (
                <div className="rounded-md bg-muted p-3 max-h-[150px] overflow-y-auto">
                  <p className="text-sm font-medium mb-2">Elementos a eliminar:</p>
                  <ul className="text-sm space-y-1">
                    {items.map((item) => (
                      <li key={item.id} className="truncate">
                        • {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isMultiple && items.length > 10 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm">
                    <strong>Primeros 10 elementos:</strong>
                  </p>
                  <ul className="text-sm space-y-1 mt-2 max-h-[120px] overflow-y-auto">
                    {items.slice(0, 10).map((item) => (
                      <li key={item.id} className="truncate">
                        • {item.name}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted-foreground mt-2">...y {items.length - 10} más</p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <LoadingButton
            variant="destructive"
            onClick={handleConfirm}
            loading={loading}
            disabled={isConfirmDisabled}
            className={cn(countdown !== null && countdown > 0 && 'cursor-not-allowed')}
          >
            {loading
              ? 'Eliminando...'
              : countdown !== null && countdown > 0
                ? `Espera ${countdown}s`
                : 'Eliminar'}
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
DeleteConfirmModal.displayName = 'DeleteConfirmModal';

export { DeleteConfirmModal };
