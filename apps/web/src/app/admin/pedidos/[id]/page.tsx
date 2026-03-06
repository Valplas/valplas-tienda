'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAdminOrderById,
  updateOrderStatus,
  getValidNextStatuses
} from '@/lib/services/orders.service';
import type { Order } from '@/lib/services/orders.service';
import { OrderStatusBadge } from '@/components/admin/order-status-badge';
import { OrderStatusSelect } from '@/components/admin/order-status-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Package, User, MapPin, CreditCard, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dayjs from 'dayjs';

export default function PedidoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Load order
  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAdminOrderById(params.id);
      setOrder(data);
    } catch (error) {
      toast.error('Error al cargar pedido');
      console.error(error);
      router.push('/admin/pedidos');
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Handle status change confirmation
  const handleStatusChangeClick = (newStatus: string) => {
    setSelectedStatus(newStatus);
    setConfirmDialogOpen(true);
  };

  // Handle status update
  const handleStatusUpdate = async () => {
    if (!order || !selectedStatus) return;

    setIsUpdating(true);
    try {
      await updateOrderStatus(order.id, selectedStatus);
      toast.success('Estado del pedido actualizado correctamente');
      loadOrder();
      setConfirmDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar estado';
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const validNextStatuses = getValidNextStatuses(order.status);
  const shippingAddress = order.shipping_address;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/pedidos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Pedido {order.order_number}</h1>
          <p className="text-muted-foreground">
            Creado el {dayjs(order.created_at).format('DD/MM/YYYY [a las] HH:mm')}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Status Change Section */}
      {validNextStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cambiar Estado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">
                  Selecciona el nuevo estado para este pedido:
                </p>
                <OrderStatusSelect
                  currentStatus={order.status}
                  validStatuses={validNextStatuses}
                  onStatusChange={handleStatusChangeClick}
                  disabled={isUpdating}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.user ? (
              <div>
                <div className="font-medium">
                  {order.user.first_name} {order.user.last_name}
                </div>
                <div className="text-sm text-muted-foreground">{order.user.email}</div>
                {order.user.phone && (
                  <div className="text-sm text-muted-foreground">{order.user.phone}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">ID: {order.user_id}</div>
            )}
          </CardContent>
        </Card>

        {/* Shipping Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Dirección de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {shippingAddress ? (
              <div>
                <div className="font-medium">{shippingAddress.alias}</div>
                <div className="text-sm text-muted-foreground">
                  {shippingAddress.street} {shippingAddress.street_number}
                  {shippingAddress.floor && `, Piso ${shippingAddress.floor}`}
                  {shippingAddress.apartment && ` ${shippingAddress.apartment}`}
                </div>
                <div className="text-sm text-muted-foreground">
                  {shippingAddress.city}, {shippingAddress.province} ({shippingAddress.postcode})
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Sin información de dirección</div>
            )}
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
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Transportista:</span>
              <span className="font-medium">{order.shipping_carrier?.name ?? '-'}</span>
            </div>
            {order.notes && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Notas:</span>
                <span className="text-sm">{order.notes}</span>
              </div>
            )}
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
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Método:</span>
              <span className="font-medium capitalize">{order.payment_method}</span>
            </div>
            {order.payment_id && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">ID de pago:</span>
                <span className="font-mono text-sm">{order.payment_id}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Productos ({order.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-sm">{item.product_sku}</TableCell>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Envío:</span>
              <span>
                {order.shipping_cost === 0 ? 'Gratis' : formatCurrency(order.shipping_cost)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total:</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Status Change Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cambio de estado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de cambiar el estado del pedido de <strong>{order.status}</strong> a{' '}
              <strong>{selectedStatus}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusUpdate} disabled={isUpdating}>
              {isUpdating ? 'Actualizando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
