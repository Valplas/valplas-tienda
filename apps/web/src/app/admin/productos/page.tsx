'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react';
import { DataTable, createCheckboxColumn } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { DeleteConfirmModal } from '@/components/ui/delete-confirm-modal';
import { Product } from '@/types';
import { getAdminProducts, deleteProduct } from '@/lib/services/products.service';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

export default function AdminProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [productToDelete, setProductToDelete] = React.useState<Product | null>(null);

  const loadProducts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAdminProducts({ limit: 500 });
      setProducts(result.products);
    } catch {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleDeleteProduct = async (product: Product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      await deleteProduct(productToDelete.id);
      toast.success('Producto eliminado correctamente');
      loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar producto');
    }
    setDeleteDialogOpen(false);
    setProductToDelete(null);
  };

  const handleBulkDelete = async (items: Product[]) => {
    const ids = items.map((p) => p.id);
    try {
      await Promise.all(ids.map((id) => deleteProduct(id)));
      toast.success(`${ids.length} producto(s) eliminado(s) correctamente`);
      loadProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar productos');
    }
  };

  const columns = React.useMemo<ColumnDef<Product>[]>(
    () => [
      createCheckboxColumn<Product>(),
      {
        accessorKey: 'image_url',
        header: 'Imagen',
        cell: ({ row }) => (
          <div className="relative w-12 h-12 rounded overflow-hidden bg-muted">
            {row.original.image_url ? (
              <img
                src={row.original.image_url}
                alt={row.original.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                Sin imagen
              </div>
            )}
          </div>
        ),
        enableSorting: false
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.sku}</span>
      },
      {
        accessorKey: 'name',
        header: 'Nombre',
        cell: ({ row }) => (
          <div className="max-w-[300px]">
            <p className="font-medium truncate">{row.original.name}</p>
            <p className="text-xs text-muted-foreground truncate">{row.original.description}</p>
          </div>
        )
      },
      {
        accessorKey: 'category',
        header: 'Categoría',
        cell: ({ row }) => row.original.category?.name || '-'
      },
      {
        accessorKey: 'brand',
        header: 'Marca',
        cell: ({ row }) => row.original.brand?.name || '-'
      },
      {
        accessorKey: 'base_price',
        header: 'Precio',
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.base_price)}</span>
        )
      },
      {
        accessorKey: 'available_stock',
        header: 'Stock',
        cell: ({ row }) => {
          const stock = row.original.available_stock;
          return (
            <Badge variant={stock === 0 ? 'destructive' : stock < 10 ? 'secondary' : 'default'}>
              {stock}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'default' : 'outline'}>
            {row.original.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        )
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/admin/productos/${row.original.id}/editar`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteProduct(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false
      }
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Productos</h1>
          <p className="text-muted-foreground mt-1">
            Administrá el catálogo de productos de tu tienda
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/productos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Link>
        </Button>
      </div>

      {/* DataTable */}
      <DataTable
        data={products}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar por nombre, SKU o descripción..."
        isLoading={isLoading}
        onDelete={handleBulkDelete}
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
      />

      {/* Single delete confirmation */}
      {productToDelete && (
        <DeleteConfirmModal
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          items={[{ id: productToDelete.id, name: productToDelete.name }]}
          onConfirm={confirmDelete}
          itemType="producto"
        />
      )}
    </div>
  );
}
