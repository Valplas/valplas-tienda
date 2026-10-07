'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { getAdminUsers, type AdminUser } from '@/lib/services/users.service';
import { displayEmail } from '@/lib/services/user-merge.service';

const MIN_SEARCH = 2;

interface MergeSearchDialogProps {
  user: AdminUser;
  onClose: () => void;
  onPick: (other: AdminUser) => void;
}

export function MergeSearchDialog({ user, onClose, onPick }: MergeSearchDialogProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const term = search.trim();

  useEffect(() => {
    if (term.length < MIN_SEARCH) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getAdminUsers({ search: term, role: 'customer', limit: 10 })
        .then(({ users }) => {
          if (active) setResults(users.filter((u) => u.id !== user.id));
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, user.id]);

  const visible = term.length >= MIN_SEARCH ? results : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fusionar con…</DialogTitle>
          <DialogDescription>
            Buscá la otra cuenta de {`${user.firstName} ${user.lastName ?? ''}`.trim()}.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            placeholder="Nombre, email o teléfono..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && term.length >= MIN_SEARCH && <CommandEmpty>Sin resultados</CommandEmpty>}
            {visible.map((u) => (
              <CommandItem key={u.id} value={u.id} onSelect={() => onPick(u)}>
                <div className="flex flex-col">
                  <span>{`${u.firstName} ${u.lastName ?? ''}`.trim()}</span>
                  <span className="text-xs text-muted-foreground">
                    {displayEmail(u.email)}
                    {u.phone ? ` · ${u.phone}` : ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
