'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getAdminOrders } from '@/lib/services/orders.service';
import type { Order } from '@/lib/services/orders.service';
import { DataTable } from '@/components/admin/data-table';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
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
import { Eye, X, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const PAGE_SIZE = 50;

export default function PedidosPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setPage(1);
    setHasMore(true);
    try {
      const { orders: data } = await getAdminOrders({ page: 1, limit: PAGE_SIZE });
      if (!isMountedRef.current) return;
      setOrders(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      if (!isMountedRef.current) return;
      toast.error('Error al cargar pedidos');
      console.error(error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async (nextPage: number) => {
    setIsLoadingMore(true);
    try {
      const { orders: data } = await getAdminOrders({ page: nextPage, limit: PAGE_SIZE });
      if (!isMountedRef.current) return;
      setOrders((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(nextPage);
    } catch {
      if (!isMountedRef.current) return;
      setHasMore(false); // detener el loop si falla
      toast.error('Error al cargar más pedidos');
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  // Apply filters client-side
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (dateFilter && dayjs(o.created_at).format('YYYY-MM-DD') !== dateFilter) return false;
      return true;
    });
  }, [orders, statusFilter, dateFilter]);

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
              {user?.email && <div className="text-sm text-muted-foreground">{user.phone}</div>}
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
          <span className="font-semibold">{formatCurrency(row.original.subtotal)}</span>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/admin/pedidos/${row.original.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
        enableSorting: false
      }
    ],
    [router]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground">Gestión de pedidos de clientes</p>
        </div>
        <Button onClick={() => router.push('/admin/pedidos/nuevo')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Orden
        </Button>
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
          <div className="relative">
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
                className="absolute right-0 top-0 h-full w-8"
                onClick={() => setDateFilter('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredOrders.length !== orders.length
            ? `${filteredOrders.length} de ${orders.length} pedido(s) cargados`
            : `${orders.length} pedido(s) cargados`}
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredOrders}
        columns={columns}
        searchKey="order_number"
        searchPlaceholder="Buscar por número de pedido o cliente..."
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
          {orders.length} pedido(s) en total
        </p>
      )}
    </div>
  );
}
