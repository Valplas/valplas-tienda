'use client';

import { useState, useEffect } from 'react';
import type { PriceList } from '@/types';
import {
  getPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList
} from '@/lib/services/price-lists.service';
import { DataTable, createCheckboxColumn } from '@/components/admin/data-table';
import { PriceListForm } from '@/components/admin/price-list-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import { Edit, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { PriceListFormData } from '@/lib/validations/price-list';

export default function ListasDePrecioPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PriceList | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await getPriceLists({ limit: 100 });
      if (res.success && res.data) {
        setPriceLists(res.data.priceLists);
      }
    } catch {
      toast.error('Error al cargar listas de precios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = () => {
    setSelected(undefined);
    setSheetOpen(true);
  };
  const handleEdit = (pl: PriceList) => {
    setSelected(pl);
    setSheetOpen(true);
  };

  const handleSubmit = async (data: PriceListFormData) => {
    setIsSubmitting(true);
    try {
      if (selected) {
        await updatePriceList(selected.id, {
          name: data.name,
          margin: data.margin,
          discount: data.discount,
          isActive: data.is_active
        });
        toast.success('Lista de precios actualizada');
      } else {
        await createPriceList({
          name: data.name,
          margin: data.margin,
          discount: data.discount,
          isActive: data.is_active
        });
        toast.success('Lista de precios creada');
      }
      setSheetOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (items: PriceList[]) => {
    try {
      await Promise.all(items.map((pl) => deletePriceList(pl.id)));
      toast.success(
        `${items.length} lista${items.length > 1 ? 's' : ''} eliminada${items.length > 1 ? 's' : ''}`
      );
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar';
      toast.error(message);
    }
  };

  const columns: ColumnDef<PriceList>[] = [
    createCheckboxColumn<PriceList>(),
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
    },
    {
      accessorKey: 'margin',
      header: 'Margen',
      cell: ({ row }) => <span>{Number(row.original.margin).toFixed(2)}%</span>
    },
    {
      accessorKey: 'discount',
      header: 'Descuento',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{Number(row.original.discount).toFixed(2)}%</span>
      )
    },
    {
      accessorKey: 'is_active',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="default" className="bg-green-500">
            Activa
          </Badge>
        ) : (
          <Badge variant="outline">Inactiva</Badge>
        )
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => handleEdit(row.original)}>
          <Edit className="h-4 w-4" />
        </Button>
      ),
      enableSorting: false
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Listas de Precio</h1>
          <p className="text-muted-foreground">Gestión de listas de precios para pedidos</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Lista
        </Button>
      </div>

      <DataTable
        data={priceLists}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar por nombre..."
        onDelete={handleDelete}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? 'Editar Lista de Precio' : 'Nueva Lista de Precio'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <PriceListForm
              priceList={selected}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
