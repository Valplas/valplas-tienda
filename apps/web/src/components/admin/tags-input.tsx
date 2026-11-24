'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagsInputProps {
  id?: string;
  'aria-label'?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
  maxLength?: number;
  /** false para valores donde importa la capitalización (ej: opciones). */
  lowercase?: boolean;
  className?: string;
}

/**
 * Input de chips: Enter o coma agrega, Backspace con el campo vacío quita el
 * último. Los tags se previsualizan en minúsculas (el server los normaliza igual).
 */
export function TagsInput({
  id,
  'aria-label': ariaLabel,
  value,
  onChange,
  placeholder = 'Escribí y apretá Enter',
  disabled,
  maxTags = 30,
  maxLength = 40,
  lowercase = true,
  className
}: TagsInputProps) {
  const [draft, setDraft] = React.useState('');

  const addTags = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      const tag = (lowercase ? trimmed.toLowerCase() : trimmed).slice(0, maxLength);
      if (tag && !next.includes(tag) && next.length < maxTags) next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const preview = lowercase ? draft.trim().toLowerCase() : '';

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5',
          disabled && 'opacity-50'
        )}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Quitar ${tag}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          aria-label={ariaLabel}
          value={draft}
          disabled={disabled || value.length >= maxTags}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && addTags(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {preview ? `Se guardará como "${preview}". ` : ''}
        {value.length}/{maxTags} tags. Enter o coma para agregar.
      </p>
    </div>
  );
}
