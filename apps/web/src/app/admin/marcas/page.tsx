'use client';

import { useState, useEffect } from 'react';
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
import { Edit, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { type BrandFormData } from '@/lib/validations/brand';

export default function MarcasPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load brands
  const loadBrands = async () => {
    setIsLoading(true);
    try {
      const data = await getAdminBrands();
      setBrands(data.brands);
    } catch (error) {
      toast.error('Error al cargar marcas');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
  }, []);

  // Handle create
  const handleCreate = () => {
    setSelectedBrand(undefined);
    setSheetOpen(true);
  };

  // Handle edit
  const handleEdit = (brand: Brand) => {
    setSelectedBrand(brand);
    setSheetOpen(true);
  };

  // Handle form submit
  const handleSubmit = async (data: BrandFormData) => {
    setIsSubmitting(true);
    try {
      // Map frontend snake_case fields to API camelCase
      const payload = {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logo_url || undefined,
        description: data.description || undefined,
        isActive: data.is_active
      };

      if (selectedBrand) {
        await updateBrand(selectedBrand.id, payload);
        toast.success('Marca actualizada correctamente');
      } else {
        await createBrand(payload);
        toast.success('Marca creada correctamente');
      }
      setSheetOpen(false);
      loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar marca';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle bulk delete
  const handleDelete = async (items: Brand[]) => {
    try {
      await deleteBrands(items.map((b) => b.id));
      toast.success(
        `${items.length} marca${items.length > 1 ? 's' : ''} eliminada${items.length > 1 ? 's' : ''} correctamente`
      );
      loadBrands();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar marcas';
      toast.error(message);
    }
  };

  // Table columns
  const columns: ColumnDef<Brand>[] = [
    createCheckboxColumn<Brand>(),
    {
      accessorKey: 'logo_url',
      header: 'Logo',
      cell: ({ row }) => {
        const logoUrl = row.original.logo_url;
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.slug}</span>
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
        searchKey="name"
        searchPlaceholder="Buscar por nombre o slug..."
        onDelete={handleDelete}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
      />

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
