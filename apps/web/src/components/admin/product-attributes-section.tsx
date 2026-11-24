'use client';

import * as React from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/admin/searchable-select';
import { getAttributes, getAttributesForCategory } from '@/services';
import type { ProductAttributeInput } from '@/services';
import type { AttributeDefinition, Product, ProductAttributeAdmin } from '@/types';

/** Lo que la sección le informa al formulario de producto. */
export interface AttributesState {
  /** false mientras carga o si falló: el form NO debe mandar `attributes` (reemplazaría todo). */
  ready: boolean;
  inputs: ProductAttributeInput[];
  /** Atributos numéricos con un valor que no es número. */
  invalidLabels: string[];
}

interface ProductAttributesSectionProps {
  categoryId?: string;
  initialAttributes?: Product['attributes'];
  onChange: (state: AttributesState) => void;
}

const isAdminAttribute = (
  a: NonNullable<Product['attributes']>[number]
): a is ProductAttributeAdmin => 'attributeId' in a;

const parseNumber = (raw: string): number => Number(raw.trim().replace(',', '.'));

export function ProductAttributesSection({
  categoryId,
  initialAttributes,
  onChange
}: ProductAttributesSectionProps) {
  const [dictionary, setDictionary] = React.useState<AttributeDefinition[]>([]);
  const [dictionaryReady, setDictionaryReady] = React.useState(false);
  const [dictionaryFailed, setDictionaryFailed] = React.useState(false);
  const [categoryAttrs, setCategoryAttrs] = React.useState<AttributeDefinition[]>([]);
  const [loadingCategory, setLoadingCategory] = React.useState(false);
  const [categoryFailed, setCategoryFailed] = React.useState(false);

  const initial = React.useMemo(
    () => (initialAttributes ?? []).filter(isAdminAttribute),
    [initialAttributes]
  );
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((a) => [a.attributeId, String(a.value)]))
  );
  // Atributos agregados a mano ("Agregar otra") + los que el producto ya traía
  const [extraIds, setExtraIds] = React.useState<string[]>(() => initial.map((a) => a.attributeId));

  React.useEffect(() => {
    let active = true;
    getAttributes()
      .then((list) => {
        if (active) setDictionary(list.filter((a) => a.isActive));
      })
      .catch(() => {
        if (active) setDictionaryFailed(true);
      })
      .finally(() => {
        if (active) setDictionaryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!categoryId) {
      setCategoryAttrs([]);
      setCategoryFailed(false);
      return;
    }
    let active = true;
    setLoadingCategory(true);
    setCategoryFailed(false);
    getAttributesForCategory(categoryId)
      .then((list) => {
        if (active) setCategoryAttrs(list);
      })
      .catch(() => {
        if (!active) return;
        setCategoryAttrs([]);
        setCategoryFailed(true);
        toast.error('No se pudieron cargar los atributos de la categoría', {
          description: 'Las características no se van a modificar al guardar.'
        });
      })
      .finally(() => {
        if (active) setLoadingCategory(false);
      });
    return () => {
      active = false;
    };
  }, [categoryId]);

  const definitionById = React.useMemo(() => {
    const map = new Map<string, AttributeDefinition>();
    for (const a of dictionary) map.set(a.id, a);
    for (const a of categoryAttrs) map.set(a.id, a);
    // Fallback: atributos del producto que ya no están en el diccionario activo
    for (const a of initial) {
      if (!map.has(a.attributeId)) {
        map.set(a.attributeId, {
          id: a.attributeId,
          key: a.key,
          label: a.label,
          valueType: a.valueType,
          unit: a.unit,
          options: a.valueType === 'option' ? [String(a.value)] : null,
          aliases: [],
          displayOrder: 0,
          isActive: false,
          createdAt: '',
          updatedAt: ''
        });
      }
    }
    return map;
  }, [dictionary, categoryAttrs, initial]);

  const shown = React.useMemo(() => {
    const ids = [...categoryAttrs.map((a) => a.id)];
    for (const id of extraIds) if (!ids.includes(id)) ids.push(id);
    return ids.map((id) => definitionById.get(id)).filter((d): d is AttributeDefinition => !!d);
  }, [categoryAttrs, extraIds, definitionById]);

  const ready = dictionaryReady && !dictionaryFailed && !loadingCategory && !categoryFailed;

  React.useEffect(() => {
    const inputs: ProductAttributeInput[] = [];
    const invalidLabels: string[] = [];
    for (const def of shown) {
      const raw = (values[def.id] ?? '').trim();
      if (!raw) continue;
      if (def.valueType === 'number') {
        const n = parseNumber(raw);
        if (!Number.isFinite(n)) invalidLabels.push(def.label);
        else inputs.push({ attributeId: def.id, value: n });
      } else {
        inputs.push({ attributeId: def.id, value: raw });
      }
    }
    onChange({ ready, inputs, invalidLabels });
  }, [shown, values, ready, onChange]);

  const setValue = (id: string, value: string) => setValues((prev) => ({ ...prev, [id]: value }));

  const removeExtra = (id: string) => {
    setExtraIds((prev) => prev.filter((x) => x !== id));
    setValues((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addable = dictionary
    .filter((a) => !shown.some((s) => s.id === a.id))
    .map((a) => ({ value: a.id, label: a.label, description: a.unit ?? undefined }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Características</h2>
        <p className="text-sm text-muted-foreground">
          Se precargan según la categoría. Dejá vacío lo que no aplique.
        </p>
      </div>

      {dictionaryFailed && (
        <p className="text-sm text-destructive">
          No se pudieron cargar los atributos. Se guardará el producto sin tocar sus
          características.
        </p>
      )}

      {categoryFailed && (
        <p className="text-sm text-destructive">
          No se pudieron cargar los atributos de la categoría. Se guardará el producto sin tocar sus
          características.
        </p>
      )}

      {loadingCategory && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando atributos...
        </div>
      )}

      {!loadingCategory && !categoryId && (
        <p className="text-sm text-muted-foreground">
          Elegí una categoría para ver sus características.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((def) => {
          const isExtra = extraIds.includes(def.id) && !categoryAttrs.some((a) => a.id === def.id);
          return (
            <div key={def.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`attr-${def.id}`}>
                  {def.label}
                  {def.unit ? ` (${def.unit})` : ''}
                </Label>
                {isExtra && (
                  <button
                    type="button"
                    onClick={() => removeExtra(def.id)}
                    aria-label={`Quitar ${def.label}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {def.valueType === 'option' ? (
                <Select
                  value={values[def.id] ?? ''}
                  onValueChange={(v) => setValue(def.id, v === '__none__' ? '' : v)}
                >
                  <SelectTrigger id={`attr-${def.id}`}>
                    <SelectValue placeholder="Sin definir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin definir</SelectItem>
                    {(def.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`attr-${def.id}`}
                  inputMode={def.valueType === 'number' ? 'decimal' : undefined}
                  value={values[def.id] ?? ''}
                  onChange={(e) => setValue(def.id, e.target.value)}
                  placeholder={def.valueType === 'number' ? 'Ej: 10' : 'Valor'}
                />
              )}
            </div>
          );
        })}
      </div>

      {addable.length > 0 && (
        <div className="space-y-1.5 sm:max-w-sm">
          <Label>Agregar otra característica</Label>
          <SearchableSelect
            value={null}
            onChange={(opt) => opt && setExtraIds((prev) => [...prev, opt.value])}
            placeholder="Elegir atributo..."
            searchPlaceholder="Buscar atributo..."
            options={addable}
            disabled={!dictionaryReady}
          />
        </div>
      )}
    </div>
  );
}
