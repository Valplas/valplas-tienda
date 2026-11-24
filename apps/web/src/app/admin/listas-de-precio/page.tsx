'use client';

import { useState, useCallback } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { UserRole } from '@/types';
import type { PriceList } from '@/types';
import {
  getPriceListsPage,
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
import { Edit, Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PriceListFormData } from '@/lib/validations/price-list';

const PAGE_SIZE = 50;

export default function ListasDePrecioPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PriceList | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    items: priceLists,
    loading: isLoading,
    loadingMore: isLoadingMore,
    hasMore,
    sentinelRef,
    reload: load
  } = useInfiniteList<PriceList>({
    // La búsqueda va al servidor: antes solo filtraba las filas ya cargadas
    resetKey: search,
    fetchPage: async ({ cursor }) => {
      const result = await getPriceListsPage({
        cursor,
        limit: PAGE_SIZE,
        search: search || undefined
      });
      return {
        items: result.priceLists,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      };
    },
    onError: (_error, phase) =>
      toast.error(
        phase === 'first'
          ? 'Error al cargar listas de precios'
          : 'Error al cargar más listas de precios'
      )
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
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
          isActive: data.isActive
        });
        toast.success('Lista de precios actualizada');
      } else {
        await createPriceList({
          name: data.name,
          margin: data.margin,
          discount: data.discount,
          isActive: data.isActive
        });
        toast.success('Lista de precios creada');
      }
      setSheetOpen(false);
      void load();
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
      void load();
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
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.isActive ? (
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
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(row.original)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => handleDelete([row.original])}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      enableSorting: false
    }
  ];

  if (authLoading || !user) return null;

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
        onSearch={handleSearch}
        searchPlaceholder="Buscar por nombre..."
        onDelete={handleDelete}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
      />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!hasMore && priceLists.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          {priceLists.length} lista(s) en total
        </p>
      )}

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
