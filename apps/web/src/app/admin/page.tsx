'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import type { Product } from '@/types';
import { Package, ShoppingCart, AlertTriangle, DollarSign } from 'lucide-react';
import { StatsCard } from '@/components/admin/stats-card';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
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
import { getAdminProducts, getAdminOrders, type Order } from '@/services';
import { formatCurrency } from '@/lib/utils';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

dayjs.locale('es');

// Estados que cuentan como "pendientes" (operativos, sin terminar)
const PENDING_STATUSES = new Set([
  'pending_payment',
  'payment_confirmed',
  'processing',
  'ready_to_ship'
]);
// Estados que NO suman a las ventas del mes
const NON_REVENUE_STATUSES = new Set(['cancelled', 'refunded', 'payment_failed', 'failed']);

export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  const [products, setProducts] = React.useState<Product[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setLoading(true);
    // Recursos independientes → Promise.all permitido
    Promise.all([
      getAdminProducts({ page: 1, limit: 500 }),
      getAdminOrders({ page: 1, limit: 500 })
    ])
      .then(([p, o]) => {
        if (cancelled) return;
        setProducts(p.products as Product[]);
        setOrders(o.orders);
        setTotalOrders(o.total);
      })
      .catch(() => {
        if (!cancelled) return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const activeProducts = products.filter((p) => p.isActive && !p.deletedAt).length;
  const pendingOrders = orders.filter((o) => PENDING_STATUSES.has(o.status)).length;

  const currentMonth = dayjs().month();
  const currentYear = dayjs().year();
  const monthRevenue = orders
    .filter((o) => {
      const d = dayjs(o.createdAt);
      return (
        d.month() === currentMonth &&
        d.year() === currentYear &&
        !NON_REVENUE_STATUSES.has(o.status)
      );
    })
    .reduce((sum, o) => sum + (o.total ?? 0), 0);

  const recentOrders = [...orders]
    .sort((a, b) => dayjs(b.createdAt).unix() - dayjs(a.createdAt).unix())
    .slice(0, 10);

  const lowStockProducts = products
    .filter((p) => p.isActive && !p.deletedAt && (p.availableStock ?? 0) < 10)
    .slice(0, 5);

  if (authLoading || !user) return null;

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
        <StatsCard
          title="Productos Activos"
          value={loading ? '—' : activeProducts}
          icon={Package}
          variant="info"
        />
        <StatsCard
          title="Total Pedidos"
          value={loading ? '—' : totalOrders}
          icon={ShoppingCart}
          variant="default"
        />
        <StatsCard
          title="Pedidos Pendientes"
          value={loading ? '—' : pendingOrders}
          icon={AlertTriangle}
          variant={pendingOrders > 0 ? 'warning' : 'success'}
        />
        <StatsCard
          title="Ventas del Mes"
          value={loading ? '—' : formatCurrency(monthRevenue)}
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
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No hay pedidos recientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>
                          {order.user ? `${order.user.firstName} ${order.user.lastName}` : '-'}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(order.total)}</TableCell>
                      </TableRow>
                    ))
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
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
            ) : lowStockProducts.length === 0 ? (
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
                      <Badge
                        variant={(product.availableStock ?? 0) === 0 ? 'destructive' : 'secondary'}
                      >
                        Stock: {product.availableStock ?? 0}
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
