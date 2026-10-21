'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps<T extends SearchableSelectOption> {
  id?: string;
  value: string | null;
  /** Texto del valor elegido (en modo async puede no estar entre las opciones cargadas) */
  selectedLabel?: string | null;
  onChange: (option: T | null) => void;
  /** Texto del botón cuando no hay nada elegido */
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Modo estático: filtra localmente */
  options?: T[];
  /**
   * Modo async: se llama al abrir y al escribir (con debounce). Memoizarlo con
   * useCallback; si cambia su identidad (ej: cambió un filtro), se vuelve a buscar.
   */
  onSearch?: (term: string) => Promise<T[]>;
  disabled?: boolean;
  clearLabel?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Select con buscador (Popover + Command). Pensado para elegir entre listas
 * largas sin que el usuario tenga que scrollear.
 */
export function SearchableSelect<T extends SearchableSelectOption>({
  id,
  value,
  selectedLabel,
  onChange,
  placeholder,
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  options,
  onSearch,
  disabled,
  clearLabel = 'Quitar'
}: SearchableSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');
  const [asyncOptions, setAsyncOptions] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);

  const isAsync = Boolean(onSearch);

  React.useEffect(() => {
    if (!open || !onSearch) return;
    let active = true;
    const search = term.trim();
    // Al abrir (sin texto) busca enseguida; mientras escribe, con debounce
    const timer = setTimeout(
      () => {
        setLoading(true);
        onSearch(search)
          .then((results) => {
            if (active) setAsyncOptions(results);
          })
          .catch(() => {
            if (active) setAsyncOptions([]);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      search ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, term, onSearch]);

  const visibleOptions = isAsync ? asyncOptions : (options ?? []);
  const label =
    selectedLabel ?? (value ? options?.find((option) => option.value === value)?.label : null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTerm('');
  };

  const handleSelect = (option: T) => {
    onChange(option);
    handleOpenChange(false);
  };

  return (
    <div className="flex gap-2">
      {/* modal: el popover vive dentro de un Sheet; sin esto no scrollea la lista */}
      <Popover open={open} onOpenChange={handleOpenChange} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-auto min-h-10 flex-1 justify-between py-2 text-left font-normal',
              !label && 'text-muted-foreground'
            )}
          >
            <span className="line-clamp-2 whitespace-normal">{label ?? placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command shouldFilter={!isAsync}>
            <CommandInput placeholder={searchPlaceholder} value={term} onValueChange={setTerm} />
            <CommandList>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              {!loading &&
                visibleOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    // cmdk filtra por `value`: el label + id evita colisiones entre nombres iguales
                    value={`${option.label} ${option.value}`}
                    keywords={option.description ? [option.description] : undefined}
                    onSelect={() => handleSelect(option)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        option.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label={clearLabel}
          title={clearLabel}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
