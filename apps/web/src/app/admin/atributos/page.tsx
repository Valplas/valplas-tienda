'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import type { AttributeDefinitionWithCategories, Category } from '@/types';
import {
  getAttributes,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  setAttributeCategories,
  getCategories
} from '@/services';
import { ApiError } from '@/lib/api';
import { apiErrorDescription } from '@/lib/api-error';
import { AttributeForm, type AttributeFormValues } from '@/components/admin/attribute-form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmModal } from '@/components/ui/delete-confirm-modal';

const TYPE_LABELS = { number: 'Número', text: 'Texto', option: 'Opción' } as const;

export default function AtributosPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const [attributes, setAttributes] = useState<AttributeDefinitionWithCategories[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<AttributeDefinitionWithCategories | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toDelete, setToDelete] = useState<AttributeDefinitionWithCategories | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // Recursos independientes
      const [attrs, cats] = await Promise.all([getAttributes(), getCategories()]);
      setAttributes(attrs);
      setCategories(cats);
    } catch (error) {
      toast.error('Error al cargar atributos', { description: apiErrorDescription(error) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (values: AttributeFormValues) => {
    setIsSubmitting(true);
    try {
      const unit = values.unit || null;
      const options = values.valueType === 'option' ? values.options : null;
      let id: string;
      if (selected) {
        await updateAttribute(selected.id, {
          label: values.label,
          unit,
          options,
          aliases: values.aliases,
          display_order: values.displayOrder,
          is_active: values.isActive
        });
        id = selected.id;
      } else {
        const created = await createAttribute({
          key: values.key,
          label: values.label,
          value_type: values.valueType,
          unit,
          ...(options ? { options } : {}),
          aliases: values.aliases,
          display_order: values.displayOrder,
          is_active: values.isActive
        });
        id = created.id;
      }
      await setAttributeCategories(id, values.categoryIds);
      toast.success(selected ? 'Atributo actualizado' : 'Atributo creado');
      setSheetOpen(false);
      void load();
    } catch (error) {
      toast.error('No se pudo guardar el atributo', { description: apiErrorDescription(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteAttribute(toDelete.id);
      toast.success('Atributo eliminado');
      void load();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ATTRIBUTE_IN_USE') {
        toast.error('El atributo tiene valores cargados en productos', {
          description: 'No se puede eliminar. Desactivalo para que deje de usarse.'
        });
      } else {
        toast.error('No se pudo eliminar el atributo', { description: apiErrorDescription(error) });
      }
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Atributos</h1>
          <p className="text-muted-foreground">
            Características de producto (capacidad, color, medidas...) por categoría
          </p>
        </div>
        <Button
          onClick={() => {
            setSelected(undefined);
            setSheetOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo atributo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : attributes.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Todavía no hay atributos.</p>
      ) : (
        <div className="grid gap-3">
          {attributes.map((attr) => (
            <div
              key={attr.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{attr.label}</span>
                  <span className="text-xs text-muted-foreground">{attr.key}</span>
                  <Badge variant="secondary">{TYPE_LABELS[attr.valueType]}</Badge>
                  {attr.unit && <Badge variant="outline">{attr.unit}</Badge>}
                  {attr.isActive ? (
                    <Badge className="bg-green-500">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {attr.categories.length > 0
                    ? attr.categories.map((c) => c.name).join(', ')
                    : 'Sin categorías asignadas'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar"
                  onClick={() => {
                    setSelected(attr);
                    setSheetOpen(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar"
                  onClick={() => setToDelete(attr)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-[540px]">
          <SheetHeader>
            <SheetTitle>{selected ? 'Editar atributo' : 'Nuevo atributo'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 px-4 pb-6">
            <AttributeForm
              key={selected?.id ?? 'new'}
              attribute={selected}
              categories={categories}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmModal
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        items={toDelete ? [{ id: toDelete.id, name: toDelete.label }] : []}
        itemType="atributo"
        onConfirm={handleDelete}
      />
    </div>
  );
}
