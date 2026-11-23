'use client';

import * as React from 'react';
import type { AttributeDefinitionWithCategories, AttributeValueType, Category } from '@/types';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TagsInput } from '@/components/admin/tags-input';

export interface AttributeFormValues {
  key: string;
  label: string;
  valueType: AttributeValueType;
  unit: string;
  options: string[];
  aliases: string[];
  displayOrder: number;
  isActive: boolean;
  categoryIds: string[];
}

interface AttributeFormProps {
  attribute?: AttributeDefinitionWithCategories;
  categories: Category[];
  onSubmit: (values: AttributeFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const KEY_REGEX = /^[a-z][a-z0-9_]{1,39}$/;

const TYPE_LABELS: Record<AttributeValueType, string> = {
  number: 'Número',
  text: 'Texto',
  option: 'Opción (lista cerrada)'
};

function slugKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function AttributeForm({
  attribute,
  categories,
  onSubmit,
  onCancel,
  isLoading
}: AttributeFormProps) {
  const isEdit = !!attribute;
  const [label, setLabel] = React.useState(attribute?.label ?? '');
  const [key, setKey] = React.useState(attribute?.key ?? '');
  const [keyTouched, setKeyTouched] = React.useState(false);
  const [valueType, setValueType] = React.useState<AttributeValueType>(
    attribute?.valueType ?? 'number'
  );
  const [unit, setUnit] = React.useState(attribute?.unit ?? '');
  const [options, setOptions] = React.useState<string[]>(attribute?.options ?? []);
  const [aliases, setAliases] = React.useState<string[]>(attribute?.aliases ?? []);
  const [displayOrder, setDisplayOrder] = React.useState(attribute?.displayOrder ?? 0);
  const [isActive, setIsActive] = React.useState(attribute?.isActive ?? true);
  const [categoryIds, setCategoryIds] = React.useState<string[]>(
    attribute?.categories.map((c) => c.id) ?? []
  );
  const [error, setError] = React.useState<string | null>(null);

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (!isEdit && !keyTouched) setKey(slugKey(value));
  };

  const toggleCategory = (id: string, checked: boolean) =>
    setCategoryIds((prev) => (checked ? [...prev, id] : prev.filter((c) => c !== id)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return setError('El nombre es obligatorio');
    if (!isEdit && !KEY_REGEX.test(key)) {
      return setError(
        'Clave inválida: minúsculas, números y _ (2 a 40 caracteres, empieza con letra)'
      );
    }
    if (valueType === 'option' && options.length === 0) {
      return setError('Agregá al menos una opción');
    }
    setError(null);
    await onSubmit({
      key,
      label: label.trim(),
      valueType,
      unit: unit.trim(),
      options,
      aliases,
      displayOrder,
      isActive,
      categoryIds
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="attr-label">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input
          id="attr-label"
          value={label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="Ej: Capacidad"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attr-key">Clave</Label>
        <Input
          id="attr-key"
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value);
          }}
          placeholder="capacidad"
          disabled={isLoading || isEdit}
        />
        <p className="text-xs text-muted-foreground">
          {isEdit
            ? 'La clave no se puede cambiar.'
            : 'Identificador interno: minúsculas, números y _. No se puede cambiar después.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de valor</Label>
          <Select
            value={valueType}
            onValueChange={(v) => setValueType(v as AttributeValueType)}
            disabled={isLoading || isEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as AttributeValueType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isEdit && <p className="text-xs text-muted-foreground">El tipo no se puede cambiar.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="attr-unit">Unidad</Label>
          <Input
            id="attr-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Ej: litros, cm"
            maxLength={20}
            disabled={isLoading}
          />
        </div>
      </div>

      {valueType === 'option' && (
        <div className="space-y-2">
          <Label>
            Opciones <span className="text-red-500">*</span>
          </Label>
          <TagsInput
            value={options}
            onChange={setOptions}
            lowercase={false}
            maxTags={50}
            maxLength={60}
            placeholder="Ej: Rojo"
            disabled={isLoading}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Sinónimos (para la búsqueda)</Label>
        <TagsInput
          value={aliases}
          onChange={setAliases}
          placeholder="Ej: volumen"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attr-order">Orden</Label>
        <Input
          id="attr-order"
          type="number"
          min={0}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label>Categorías donde aplica</Label>
        <p className="text-xs text-muted-foreground">
          También aplica a las subcategorías de las elegidas.
        </p>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay categorías.</p>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Checkbox
                id={`attr-cat-${c.id}`}
                checked={categoryIds.includes(c.id)}
                onCheckedChange={(checked) => toggleCategory(c.id, !!checked)}
                disabled={isLoading}
              />
              <Label htmlFor={`attr-cat-${c.id}`} className="cursor-pointer font-normal">
                {c.name}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="attr-active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(!!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="attr-active" className="cursor-pointer">
          Atributo activo
        </Label>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <LoadingButton type="submit" loading={isLoading} loadingText="Guardando...">
          {isEdit ? 'Actualizar' : 'Crear'}
        </LoadingButton>
      </div>
    </form>
  );
}
