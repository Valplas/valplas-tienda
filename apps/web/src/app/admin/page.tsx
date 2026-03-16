'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { Package, ShoppingCart, AlertTriangle, DollarSign } from 'lucide-react';
import { StatsCard } from '@/components/admin/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { MOCK_PRODUCTS } from '@/lib/mock/data/products';
import { MOCK_ORDERS } from '@/lib/mock/data/orders';
import { OrderStatus } from '@/types';
import { formatCurrency } from '@/lib/utils';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

dayjs.locale('es');

const orderStatusLabels: Record<
  OrderStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  [OrderStatus.PENDING]: { label: 'Pendiente', variant: 'outline' },
  [OrderStatus.PROCESSING]: { label: 'Procesando', variant: 'secondary' },
  [OrderStatus.SHIPPED]: { label: 'Enviado', variant: 'default' },
  [OrderStatus.DELIVERED]: { label: 'Entregado', variant: 'default' },
  [OrderStatus.CANCELLED]: { label: 'Cancelado', variant: 'destructive' }
};

export default function AdminDashboardPage() {
  const { user, isLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  if (isLoading || !user) return null;

  // Calculate stats
  const activeProducts = MOCK_PRODUCTS.filter((p) => p.is_active && !p.deleted_at).length;
  const totalOrders = MOCK_ORDERS.length;
  const pendingOrders = MOCK_ORDERS.filter(
    (o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.PROCESSING
  ).length;

  // Calculate revenue for current month
  const currentMonth = dayjs().month();
  const currentYear = dayjs().year();
  const monthRevenue = MOCK_ORDERS.filter((o) => {
    const orderDate = dayjs(o.created_at);
    return (
      orderDate.month() === currentMonth &&
      orderDate.year() === currentYear &&
      o.status !== OrderStatus.CANCELLED
    );
  }).reduce((sum, o) => sum + o.total, 0);

  // Recent orders (last 10)
  const recentOrders = [...MOCK_ORDERS]
    .sort((a, b) => dayjs(b.created_at).unix() - dayjs(a.created_at).unix())
    .slice(0, 10);

  // Low stock products (stock < 10)
  const lowStockProducts = MOCK_PRODUCTS.filter(
    (p) => p.is_active && !p.deleted_at && p.available_stock < 10
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Vista general de tu negocio y métricas principales
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Productos Activos" value={activeProducts} icon={Package} variant="info" />
        <StatsCard
          title="Total Pedidos"
          value={totalOrders}
          icon={ShoppingCart}
          variant="default"
        />
        <StatsCard
          title="Pedidos Pendientes"
          value={pendingOrders}
          icon={AlertTriangle}
          variant={pendingOrders > 0 ? 'warning' : 'success'}
        />
        <StatsCard
          title="Ventas del Mes"
          value={formatCurrency(monthRevenue)}
          icon={DollarSign}
          variant="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold">Pedidos Recientes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/pedidos">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No hay pedidos recientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentOrders.map((order) => {
                      const statusInfo = orderStatusLabels[order.status];
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell>
                            {order.user ? `${order.user.first_name} ${order.user.last_name}` : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(order.total)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Low stock alert */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold">Alerta de Stock Bajo</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/productos">Ver productos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Todos los productos tienen stock suficiente
              </p>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <Badge variant={product.available_stock === 0 ? 'destructive' : 'secondary'}>
                        Stock: {product.available_stock}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
