'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/formatters';
import type { AdminUser } from '@/lib/services/users.service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { MergeSearchDialog } from './merge-search-dialog';
import { MergeUsersDialog } from './merge-users-dialog';

interface ConflictDetails {
  conflictUserId: string;
  conflictUserName: string;
  conflictUserCreatedAt: string;
}

interface ContactConflict extends ConflictDetails {
  user: AdminUser;
  field: 'email' | 'phone';
}

/**
 * Estado y diálogos del merge desde /admin/usuarios: "Fusionar con…" y la oferta de merge
 * cuando el guardado choca con el email/teléfono de otra cuenta (409).
 */
export function useUserMerge(onMerged: () => void): {
  openMergeWith: (user: AdminUser) => void;
  handleSaveConflict: (error: unknown, user: AdminUser) => boolean;
  mergeDialogs: ReactNode;
} {
  const [searchFor, setSearchFor] = useState<AdminUser | null>(null);
  const [conflict, setConflict] = useState<ContactConflict | null>(null);
  const [pair, setPair] = useState<{ keepId: string; absorbId: string } | null>(null);

  const openMergeWith = useCallback((user: AdminUser) => setSearchFor(user), []);

  const handleSaveConflict = useCallback((error: unknown, user: AdminUser): boolean => {
    if (!(error instanceof ApiError)) return false;
    if (error.code !== 'EMAIL_IN_USE' && error.code !== 'PHONE_IN_USE') return false;
    setConflict({
      user,
      field: error.code === 'EMAIL_IN_USE' ? 'email' : 'phone',
      ...(error.details as ConflictDetails)
    });
    return true;
  }, []);

  const fieldLabel = conflict?.field === 'phone' ? 'teléfono' : 'email';

  const mergeDialogs = (
    <>
      {searchFor && (
        <MergeSearchDialog
          user={searchFor}
          onClose={() => setSearchFor(null)}
          onPick={(other) => {
            setPair({ keepId: searchFor.id, absorbId: other.id });
            setSearchFor(null);
          }}
        />
      )}

      <AlertDialog open={!!conflict} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El {fieldLabel} pertenece a otra cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              Este {fieldLabel} ya lo usa {conflict?.conflictUserName} (alta{' '}
              {conflict ? formatDate(conflict.conflictUserCreatedAt) : ''}). ¿Querés fusionar las
              dos cuentas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (conflict)
                  setPair({ keepId: conflict.user.id, absorbId: conflict.conflictUserId });
                setConflict(null);
              }}
            >
              Revisar fusión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pair && (
        <MergeUsersDialog
          key={`${pair.keepId}:${pair.absorbId}`}
          keepUserId={pair.keepId}
          absorbUserId={pair.absorbId}
          onClose={() => setPair(null)}
          onMerged={() => {
            setPair(null);
            onMerged();
          }}
        />
      )}
    </>
  );

  return { openMergeWith, handleSaveConflict, mergeDialogs };
}
