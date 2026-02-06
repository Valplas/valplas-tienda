'use client';

/**
 * Order Detail Page
 * Shows complete order information including products, shipping, and status
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
import { getOrderById } from '@/services';
import { Order } from '@/types';
import { formatDate, formatDateTime, formatPrice } from '@/lib/formatters';
import { ArrowLeft, Package, MapPin, Truck, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !params.id) return;

    const fetchOrder = async () => {
      setIsLoading(true);
      try {
        const order = await getOrderById(params.id as string);
        setOrder(order as any);
      } catch (error: any) {
        console.error('Error fetching order:', error);
        if (error?.message?.includes('403') || error?.message?.includes('Forbidden')) {
          toast.error('No tenés permiso para ver este pedido');
        } else {
          toast.error('Error al cargar el pedido');
        }
        router.push('/cuenta/pedidos');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [user, params.id, router]);

  if (isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (!order) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/cuenta/pedidos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Pedido {order.order_number}</h1>
          <p className="mt-1 text-muted-foreground">
            Realizado el {formatDate(order.created_at)} a las{' '}
            {formatDateTime(order.created_at).split(' ')[1]}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Productos
              </CardTitle>
              <CardDescription>Items incluidos en este pedido</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead className="text-right">Precio Unitario</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-sm text-muted-foreground">SKU: {item.product_sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatPrice(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPrice(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatPrice(order.subtotal)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">
                      Envío
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {order.shipping_cost === 0 ? 'Gratis' : formatPrice(order.shipping_cost)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right text-lg font-bold">
                      Total
                    </TableCell>
                    <TableCell className="text-right text-lg font-bold">
                      {formatPrice(order.total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Shipping Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Información de Envío
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Carrier</p>
                <p className="text-base">{order.shipping_carrier}</p>
              </div>

              {order.tracking_number && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Número de Seguimiento</p>
                  <p className="text-base font-mono">{order.tracking_number}</p>
                </div>
              )}

              {order.shipped_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Fecha de Envío</p>
                  <p className="text-base">{formatDateTime(order.shipped_at)}</p>
                </div>
              )}

              {order.delivered_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Fecha de Entrega</p>
                  <p className="text-base">{formatDateTime(order.delivered_at)}</p>
                </div>
              )}

              {order.cancelled_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Fecha de Cancelación</p>
                  <p className="text-base">{formatDateTime(order.cancelled_at)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Shipping Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Dirección de Envío
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{order.shipping_address.label}</p>
                <p>
                  {order.shipping_address.street} {order.shipping_address.street_number}
                </p>
                {(order.shipping_address.floor || order.shipping_address.apartment) && (
                  <p>
                    {order.shipping_address.floor && `Piso ${order.shipping_address.floor}`}
                    {order.shipping_address.floor && order.shipping_address.apartment && ', '}
                    {order.shipping_address.apartment &&
                      `Depto ${order.shipping_address.apartment}`}
                  </p>
                )}
                <p>
                  {order.shipping_address.city}, {order.shipping_address.province}
                </p>
                <p>CP: {order.shipping_address.postcode}</p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Información de Pago
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Método de Pago</p>
                <p className="text-base capitalize">{order.payment_method}</p>
              </div>

              {order.payment_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ID de Pago</p>
                  <p className="text-base font-mono text-xs">{order.payment_id}</p>
                </div>
              )}

              {order.payment_status && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Estado del Pago</p>
                  <p className="text-base capitalize">{order.payment_status}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full">
                <Link href="/cuenta/pedidos">Volver a Mis Pedidos</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-1 h-5 w-48" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="mt-2 h-4 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
