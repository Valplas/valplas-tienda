'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { UserRole } from '@/types';
import { Brand } from '@/types';
import {
  getAdminBrands,
  createBrand,
  updateBrand,
  deleteBrands
} from '@/lib/services/brands.service';
import { DataTable, createCheckboxColumn } from '@/components/admin/data-table';
import { BrandForm } from '@/components/admin/brand-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import { Edit, Plus, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { type BrandFormData } from '@/lib/validations/brand';

const PAGE_SIZE = 50;

export default function MarcasPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    items: brands,
    loading: isLoading,
    loadingMore: isLoadingMore,
    hasMore,
    sentinelRef,
    reload: loadBrands
  } = useInfiniteList<Brand>({
    // La búsqueda va al servidor: antes solo filtraba las filas ya cargadas
    resetKey: search,
    fetchPage: async ({ cursor }) => {
      const data = await getAdminBrands({
        cursor,
        limit: PAGE_SIZE,
        search: search || undefined
      });
      return { items: data.brands, hasMore: data.hasMore, nextCursor: data.nextCursor };
    },
    onError: (_error, phase) =>
      toast.error(phase === 'first' ? 'Error al cargar marcas' : 'Error al cargar más marcas')
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleCreate = () => {
    setSelectedBrand(undefined);
    setSheetOpen(true);
  };

  const handleEdit = (brand: Brand) => {
    setSelectedBrand(brand);
    setSheetOpen(true);
  };

  const handleSubmit = async (data: BrandFormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logoUrl || undefined,
        description: data.description || undefined,
        isActive: data.isActive
      };

      if (selectedBrand) {
        await updateBrand(selectedBrand.id, payload);
        toast.success('Marca actualizada correctamente');
      } else {
        await createBrand(payload);
        toast.success('Marca creada correctamente');
      }
      setSheetOpen(false);
      void loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar marca';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (items: Brand[]) => {
    try {
      await deleteBrands(items.map((b) => b.id));
      toast.success(
        `${items.length} marca${items.length > 1 ? 's' : ''} eliminada${items.length > 1 ? 's' : ''} correctamente`
      );
      void loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar marcas';
      toast.error(message);
    }
  };

  const columns = useMemo<ColumnDef<Brand>[]>(
    () => [
      createCheckboxColumn<Brand>(),
      {
        accessorKey: 'logoUrl',
        header: 'Logo',
        cell: ({ row }) => {
          const logoUrl = row.original.logoUrl;
          return (
            <div className="w-12 h-12 relative rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={row.original.name}
                  fill
                  className="object-contain p-1"
                  unoptimized
                />
              ) : (
                <Package className="h-6 w-6 text-gray-400" />
              )}
            </div>
          );
        },
        enableSorting: false
      },
      {
        accessorKey: 'name',
        header: 'Nombre',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.slug}</span>
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
          <Button variant="ghost" size="icon" onClick={() => handleEdit(row.original)}>
            <Edit className="h-4 w-4" />
          </Button>
        ),
        enableSorting: false
      }
    ],
    []
  );

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marcas</h1>
          <p className="text-muted-foreground">Gestión de marcas de productos</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Marca
        </Button>
      </div>

      {/* DataTable */}
      <DataTable
        data={brands}
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
      {!hasMore && brands.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          {brands.length} marca(s) en total
        </p>
      )}

      {/* Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedBrand ? 'Editar Marca' : 'Nueva Marca'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <BrandForm
              brand={selectedBrand}
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
