'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/formatters';
import {
  displayEmail,
  getMergePreview,
  mergeUsers,
  type MergePreview,
  type MergeResult,
  type MergeUserSummary
} from '@/lib/services/user-merge.service';

const FIELD_LABELS: Record<'email' | 'username' | 'phone', string> = {
  email: 'Email',
  username: 'Usuario',
  phone: 'Teléfono'
};

interface MergeUsersDialogProps {
  keepUserId: string;
  absorbUserId: string;
  onClose: () => void;
  onMerged: (result: MergeResult) => void;
}

/** Montar con `key` por par: el estado inicial sale de las props. */
export function MergeUsersDialog({
  keepUserId,
  absorbUserId,
  onClose,
  onMerged
}: MergeUsersDialogProps) {
  const [pair, setPair] = useState({ keep: keepUserId, absorb: absorbUserId });
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const autoSwapDone = useRef(false);

  useEffect(() => {
    let active = true;
    getMergePreview(pair.keep, pair.absorb)
      .then((data) => {
        if (!active) return;
        // Por defecto se conserva la cuenta legacy: tiene el historial del CRM
        if (!autoSwapDone.current && !data.target.isLegacy && data.source.isLegacy) {
          autoSwapDone.current = true;
          setPair({ keep: pair.absorb, absorb: pair.keep });
          return;
        }
        autoSwapDone.current = true;
        setPreview(data);
        setPreviewError(null);
        setLoadingPreview(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPreviewError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa');
        setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [pair]);

  const handleSwap = () => {
    autoSwapDone.current = true;
    setLoadingPreview(true);
    setPreview(null);
    setPair((p) => ({ keep: p.absorb, absorb: p.keep }));
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const result = await mergeUsers(pair.keep, pair.absorb);
      toast.success(
        `Cuentas fusionadas: ${result.moved.orders} órdenes y ${result.moved.addresses} direcciones movidas`
      );
      setConfirmOpen(false);
      onMerged(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo fusionar');
    } finally {
      setMerging(false);
    }
  };

  const access = preview
    ? [preview.result.hasGoogle && 'Google', preview.result.hasPassword && 'Contraseña']
        .filter(Boolean)
        .join(' + ') || 'Sin acceso (puede entrar con Google)'
    : '';

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !merging) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fusionar cuentas</DialogTitle>
            <DialogDescription>
              Las órdenes y direcciones de la cuenta absorbida pasan a la que se conserva.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingPreview && previewError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}

          {!loadingPreview && preview && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
                <AccountCard title="Se conserva" account={preview.target} />
                <div className="flex justify-center md:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSwap}
                    disabled={merging}
                    aria-label="Invertir cuentas"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                </div>
                <AccountCard title="Se absorbe" account={preview.source} muted />
              </div>

              <div className="space-y-1 rounded-md border p-3 text-sm">
                <p className="font-medium">Resultado</p>
                <p className="break-all">Email: {displayEmail(preview.result.email)}</p>
                <p>Usuario: {preview.result.username ?? '—'}</p>
                <p>Teléfono: {preview.result.phone ?? '—'}</p>
                <p>Acceso: {access}</p>
                <p className="text-muted-foreground">
                  Se moverán {preview.source.ordersCount} órdenes y {preview.source.addressesCount}{' '}
                  direcciones.
                </p>
              </div>

              {preview.discarded.length > 0 && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Se descartan:{' '}
                    {preview.discarded.map((d) => `${FIELD_LABELS[d.field]} ${d.value}`).join(', ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={merging}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!preview || loadingPreview || merging}
            >
              Fusionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !merging && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmás la fusión?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La cuenta absorbida se desactiva y su sesión se
              cierra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <Button onClick={handleMerge} disabled={merging}>
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {merging ? 'Fusionando...' : 'Fusionar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AccountCard({
  title,
  account,
  muted
}: {
  title: string;
  account: MergeUserSummary;
  muted?: boolean;
}) {
  return (
    <div className={`space-y-1 rounded-md border p-3 text-sm ${muted ? 'bg-muted/40' : ''}`}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
      <p className="font-semibold">{`${account.firstName} ${account.lastName ?? ''}`.trim()}</p>
      <div className="flex flex-wrap gap-1">
        {account.isLegacy && <Badge variant="secondary">Cliente del CRM</Badge>}
        {account.hasGoogle && <Badge variant="outline">Google</Badge>}
      </div>
      <p className="break-all">{displayEmail(account.email)}</p>
      <p>{account.phone ?? 'Sin teléfono'}</p>
      <p className="text-muted-foreground">
        Alta {formatDate(account.createdAt)} · {account.ordersCount} órdenes ·{' '}
        {account.addressesCount} direcciones
      </p>
    </div>
  );
}
