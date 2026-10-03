'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { Package, ShoppingCart, AlertTriangle, DollarSign, Loader2 } from 'lucide-react';
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
import { getDashboardStats, type DashboardStats } from '@/services';
import { formatCurrency } from '@/lib/utils';
export default function AdminDashboardPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadStats = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await getDashboardStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar métricas');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (authLoading || !user) return;
    loadStats();
  }, [authLoading, user, loadStats]);

  const pendingOrders = stats?.pendingOrders ?? 0;
  const recentOrders = stats?.recentOrders ?? [];
  const lowStockProducts = stats?.lowStockProducts ?? [];
  const showValue = (value: string | number | undefined): string | number =>
    loading || !stats || value === undefined ? '—' : value;

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

      {error && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Cargando...' : 'Reintentar'}
          </Button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Productos Activos"
          value={showValue(stats?.activeProducts)}
          icon={Package}
          variant="info"
        />
        <StatsCard
          title="Total Pedidos"
          value={showValue(stats?.totalOrders)}
          icon={ShoppingCart}
          variant="default"
        />
        <StatsCard
          title="Pedidos Pendientes"
          value={showValue(pendingOrders)}
          icon={AlertTriangle}
          variant={pendingOrders > 0 ? 'warning' : 'success'}
        />
        <StatsCard
          title="Ventas del Mes"
          value={showValue(formatCurrency(stats?.monthRevenue ?? 0))}
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
