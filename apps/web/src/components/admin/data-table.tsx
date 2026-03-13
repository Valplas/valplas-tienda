'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
  ColumnFiltersState,
  getFilteredRowModel,
  RowSelectionState
} from '@tanstack/react-table';
import { Search, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteConfirmModal, type DeleteConfirmItem } from '@/components/ui/delete-confirm-modal';
import { Checkbox } from '@/components/ui/checkbox';

export interface DataTablePagination {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  searchKey?: keyof TData;
  searchPlaceholder?: string;
  /** When provided, search is delegated to the parent (server-side). Called with debounce. */
  onSearch?: (value: string) => void;
  onSelectionChange?: (selectedRows: TData[]) => void;
  onDelete?: (items: TData[]) => Promise<void>;
  isLoading?: boolean;
  pagination?: DataTablePagination;
  getRowId?: (row: TData) => string;
  getRowName?: (row: TData) => string;
}

export function DataTable<TData>({
  data,
  columns,
  searchKey,
  searchPlaceholder = 'Buscar...',
  onSearch,
  onSelectionChange,
  onDelete,
  isLoading = false,
  pagination,
  getRowId,
  getRowName
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    },
    enableRowSelection: !!onDelete,
    getRowId: getRowId ? (row) => getRowId(row) : undefined
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  // Keep a stable ref to table.getColumn so it doesn't need to be a dep in the effect
  const tableRef = React.useRef(table);
  tableRef.current = table;

  // Track whether the user has performed at least one search, so we know when to call onSearch('')
  // to clear results. Without this, DataTable would call onSearch('') on initial mount and trigger
  // a React 19 warning ("state update on a component that hasn't mounted yet").
  const hasSearchedRef = React.useRef(false);

  // Debounced search — server-side when onSearch is provided, otherwise client-side via TanStack.
  // For server-side (onSearch), only trigger when ≥3 chars, or when clearing after a prior search.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch) {
        if (searchValue.length >= 3) {
          hasSearchedRef.current = true;
          onSearch(searchValue);
        } else if (searchValue.length === 0 && hasSearchedRef.current) {
          hasSearchedRef.current = false;
          onSearch('');
        }
      } else if (searchKey) {
        tableRef.current.getColumn(String(searchKey))?.setFilterValue(searchValue);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchValue, searchKey, onSearch]);

  React.useEffect(() => {
    if (!onSelectionChange) return;
    const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
    onSelectionChange(selected);
  }, [rowSelection, onSelectionChange, table]);

  const handleDelete = async () => {
    if (!onDelete || selectedRows.length === 0) return;
    await onDelete(selectedRows);
    setRowSelection({});
    setDeleteDialogOpen(false);
  };

  const deleteItems: DeleteConfirmItem[] = selectedRows.map((row) => ({
    id: getRowId ? getRowId(row) : JSON.stringify(row),
    name: getRowName ? getRowName(row) : 'Item'
  }));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        {(searchKey || onSearch) && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Bulk actions */}
        {onDelete && selectedRows.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="ml-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar {selectedRows.length > 1 ? `(${selectedRows.length})` : ''}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              // Empty state
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            ) : (
              // Data rows
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedRows.length > 0 && (
              <span>
                {selectedRows.length} de {pagination.total} fila(s) seleccionada(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Anterior
            </Button>
            <div className="text-sm">
              Página {pagination.page} de {Math.ceil(pagination.total / pagination.limit) || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {onDelete && (
        <DeleteConfirmModal
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          items={deleteItems}
          onConfirm={handleDelete}
          itemType="producto"
          countdownSeconds={3}
        />
      )}
    </div>
  );
}

// Helper function to create checkbox column
export function createCheckboxColumn<TData>(): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todo"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false
  };
}
