'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import {
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  getValidNextStatuses
} from '@/lib/services/orders.service';
import type { Order } from '@/lib/services/orders.service';
import { DataTable } from '@/components/admin/data-table';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ColumnDef } from '@tanstack/react-table';
import { Eye, X, Loader2, Plus, Printer, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { printOrder, printOrders } from '@/lib/generate-order-pdf';

const PAGE_SIZE = 50;

export default function PedidosPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [isPrintingToday, setIsPrintingToday] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadOrders = useCallback(
    async (searchTerm: string) => {
      setIsLoading(true);
      setPage(1);
      setHasMore(true);
      try {
        const { orders: data, total: t } = await getAdminOrders({
          page: 1,
          limit: PAGE_SIZE,
          status: statusFilter,
          from_date: dateFilter || undefined,
          to_date: dateFilter ? `${dateFilter}T23:59:59` : undefined,
          search: searchTerm || undefined
        });
        if (!isMountedRef.current) return;
        setOrders(data);
        setTotal(t);
        setHasMore(data.length === PAGE_SIZE);
      } catch (error) {
        if (!isMountedRef.current) return;
        toast.error('Error al cargar pedidos');
        console.error(error);
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [statusFilter, dateFilter]
  );

  const loadMore = useCallback(
    async (nextPage: number) => {
      setIsLoadingMore(true);
      try {
        const { orders: data } = await getAdminOrders({
          page: nextPage,
          limit: PAGE_SIZE,
          status: statusFilter,
          from_date: dateFilter || undefined,
          to_date: dateFilter ? `${dateFilter}T23:59:59` : undefined,
          search: search || undefined
        });
        if (!isMountedRef.current) return;
        setOrders((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
        setPage(nextPage);
      } catch {
        if (!isMountedRef.current) return;
        setHasMore(false);
        toast.error('Error al cargar más pedidos');
      } finally {
        if (isMountedRef.current) setIsLoadingMore(false);
      }
    },
    [statusFilter, dateFilter, search]
  );

  // Reload from page 1 whenever filters change
  useEffect(() => {
    loadOrders(search);
  }, [loadOrders, search]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await updateOrderStatus(cancelTarget.id, 'cancelled');
      toast.success(`Pedido ${cancelTarget.order_number} cancelado`);
      setCancelTarget(null);
      loadOrders(search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cancelar el pedido');
    } finally {
      setIsCancelling(false);
    }
  }, [cancelTarget, search, loadOrders]);

  const handlePrintToday = useCallback(async () => {
    setIsPrintingToday(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const { orders: todayOrders } = await getAdminOrders({
        page: 1,
        limit: 500,
        from_date: today,
        to_date: `${today}T23:59:59`
      });
      if (todayOrders.length === 0) {
        toast.info('No hay pedidos para hoy');
        return;
      }
      // Fetch full details (with items) in parallel
      const fullOrders = await Promise.all(todayOrders.map((o) => getAdminOrderById(o.id)));
      printOrders(fullOrders);
    } catch {
      toast.error('Error al obtener pedidos de hoy');
    } finally {
      setIsPrintingToday(false);
    }
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadMore(page + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, isLoading, page, loadMore]);

  // Table columns
  const columns = useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: 'order_number',
        header: 'N° Pedido',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.original.order_number}</span>
        )
      },
      {
        accessorKey: 'customer',
        header: 'Cliente',
        cell: ({ row }) => {
          const user = row.original.user;
          const name = user
            ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
            : null;
          return (
            <div>
              <div className="font-medium">{name ?? row.original.user_id}</div>
              {user?.phone && <div className="text-sm text-muted-foreground">{user.phone}</div>}
            </div>
          );
        },
        enableSorting: false
      },
      {
        accessorKey: 'created_at',
        header: 'Fecha',
        cell: ({ row }) => (
          <div>
            <div>{dayjs(row.original.created_at).format('DD/MM/YYYY')}</div>
            <div className="text-xs text-muted-foreground">
              {dayjs(row.original.created_at).format('HH:mm')}
            </div>
          </div>
        )
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-semibold">{formatCurrency(row.original.total)}</span>
        )
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/admin/pedidos/${row.original.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Imprimir pedido"
              onClick={async () => {
                try {
                  const full = await getAdminOrderById(row.original.id);
                  printOrder(full);
                } catch {
                  toast.error('Error al generar el PDF');
                }
              }}
            >
              <Printer className="h-4 w-4" />
            </Button>
            {getValidNextStatuses(row.original.status).includes('cancelled') && (
              <Button
                variant="ghost"
                size="icon"
                title="Cancelar pedido"
                className="text-destructive hover:text-destructive"
                onClick={() => setCancelTarget(row.original)}
              >
                <Ban className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
        enableSorting: false
      }
    ],
    [router, setCancelTarget]
  );

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground">Gestión de pedidos de clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrintToday} disabled={isPrintingToday}>
            {isPrintingToday ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Imprimir de hoy
          </Button>
          <Button onClick={() => router.push('/admin/pedidos/nuevo')}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Orden
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Estado:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-45">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending_payment">Pendiente de pago</SelectItem>
              <SelectItem value="payment_confirmed">Pago confirmado</SelectItem>
              <SelectItem value="processing">En proceso</SelectItem>
              <SelectItem value="ready_to_ship">Listo para enviar</SelectItem>
              <SelectItem value="shipped">Enviado</SelectItem>
              <SelectItem value="delivered">Entregado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="refunded">Reembolsado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Fecha:</span>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-40"
            />
            {dateFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setDateFilter('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {!isLoading && <div className="text-sm text-muted-foreground">{total} pedido(s)</div>}
      </div>

      {/* DataTable */}
      <DataTable
        data={orders}
        columns={columns}
        onSearch={handleSearch}
        searchPlaceholder="Buscar por N° pedido, cliente, email o teléfono..."
        isLoading={isLoading}
        getRowId={(row) => row.id}
        getRowName={(row) => row.order_number}
      />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!hasMore && orders.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          {orders.length} pedido(s) mostrado(s)
        </p>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de cancelar el pedido <strong>{cancelTarget?.order_number}</strong>?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? 'Cancelando...' : 'Cancelar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
