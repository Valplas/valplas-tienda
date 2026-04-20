/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Orders List Page
 * Shows all user orders with filtering and sorting
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
import { getUserOrders } from '@/services';
import { Order, OrderStatus } from '@/types';
import { formatDate, formatPrice } from '@/lib/formatters';
import { Package, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function OrdersListPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const response = await getUserOrders();

        if (response.success && response.data) {
          setOrders(response.data as any);
          setFilteredOrders(response.data as any);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast.error('Error al cargar los pedidos');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  // Filter orders when status filter changes
  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter((order) => order.status === statusFilter));
    }
  }, [statusFilter, orders]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return <OrdersListSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Mis Pedidos</h1>
          <p className="mt-2 text-muted-foreground">
            Historial completo de tus pedidos ({orders.length})
          </p>
        </div>

        {/* Filter by status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value={OrderStatus.PENDING}>Pendiente</SelectItem>
            <SelectItem value={OrderStatus.PROCESSING}>En proceso</SelectItem>
            <SelectItem value={OrderStatus.SHIPPED}>Enviado</SelectItem>
            <SelectItem value={OrderStatus.DELIVERED}>Entregado</SelectItem>
            <SelectItem value={OrderStatus.CANCELLED}>Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos</CardTitle>
          <CardDescription>
            {statusFilter === 'all'
              ? `Mostrando ${filteredOrders.length} pedidos`
              : `Mostrando ${filteredOrders.length} pedidos con estado "${getStatusLabel(statusFilter)}"`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">
                {statusFilter === 'all' ? 'No tenés pedidos aún' : 'No hay pedidos con este estado'}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {statusFilter === 'all'
                  ? 'Empezá a comprar y vas a ver tus pedidos acá'
                  : 'Probá con otro filtro o mirá todos los pedidos'}
              </p>
              {statusFilter === 'all' ? (
                <Button asChild>
                  <Link href="/productos">Ir a Productos</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setStatusFilter('all')}>
                  Ver Todos los Pedidos
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                    <TableHead className="hidden md:table-cell">Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-muted-foreground">
                          {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold">{formatPrice(order.total)}</TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/cuenta/pedidos/${order.id}`}>
                            <Eye className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Ver Detalles</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    [OrderStatus.PENDING]: 'Pendiente',
    [OrderStatus.PROCESSING]: 'En proceso',
    [OrderStatus.SHIPPED]: 'Enviado',
    [OrderStatus.DELIVERED]: 'Entregado',
    [OrderStatus.CANCELLED]: 'Cancelado'
  };
  return labels[status] || status;
}

function OrdersListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-full md:w-[200px]" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
