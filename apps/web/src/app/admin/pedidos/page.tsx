'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Eye, Package, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

export default function PedidosPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Load orders
  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const { orders: data } = await getAdminOrders({ limit: 500 });
      setOrders(data);
    } catch (error) {
      toast.error('Error al cargar pedidos');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Apply filters client-side
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (dateFilter && dayjs(o.created_at).format('YYYY-MM-DD') !== dateFilter) return false;
      return true;
    });
  }, [orders, statusFilter, dateFilter]);

  // Handle view order
  const handleViewOrder = (order: Order) => {
    router.push(`/admin/pedidos/${order.id}`);
  };

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
          return (
            <div>
              {user ? (
                <>
                  <div className="font-medium">
                    {user.first_name} {user.last_name}
                  </div>
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">{row.original.user_id}</div>
              )}
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
        id: 'items_count',
        header: 'Productos',
        cell: ({ row }) => {
          const itemCount = row.original.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <div className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{itemCount}</span>
            </div>
          );
        },
        enableSorting: false
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
          <Button variant="ghost" size="icon" onClick={() => handleViewOrder(row.original)}>
            <Eye className="h-4 w-4" />
          </Button>
        ),
        enableSorting: false
      }
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground">Gestión de pedidos de clientes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Estado:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
              className="w-[160px]"
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
          Mostrando {filteredOrders.length} de {orders.length} pedido(s)
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
    </div>
  );
}
