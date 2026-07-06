/**
 * Order Confirmation Page
 * /confirmacion/[orderId]
 *
 * Client component: el pedido se consulta con la sesión del browser
 * (cookies HttpOnly). Como Server Component el fetch salía sin cookies
 * → 401 → notFound() para cualquier usuario logueado.
 */

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderById } from '@/services';
import type { Order } from '@/lib/services/orders.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Package, Loader2 } from 'lucide-react';
import { formatPrice, formatDateTime } from '@/lib/formatters';

interface OrderConfirmationPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pendiente de pago',
  payment_confirmed: 'Pago confirmado',
  processing: 'En preparación',
  ready_to_ship: 'Listo para enviar',
  shipped: 'Enviado',
  in_transit: 'En tránsito',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  failed: 'Pago fallido',
  payment_failed: 'Pago fallido',
  refunded: 'Reembolsado'
};

export default function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrderById(orderId)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="container max-w-3xl py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container max-w-3xl py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold">No encontramos este pedido</h1>
        <p className="text-muted-foreground">
          Verificá que estés logueado con la cuenta que hizo la compra.
        </p>
        <Button asChild>
          <Link href="/cuenta/pedidos">Ir a mis pedidos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">¡Pedido confirmado!</h1>
        <p className="text-muted-foreground">Recibimos tu pedido y lo estamos procesando</p>
      </div>

      {/* Order Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pedido {order.orderNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Estado:</span>
              <div className="font-medium mt-1">{STATUS_LABELS[order.status] ?? order.status}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha:</span>
              <div className="font-medium mt-1">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <h3 className="font-medium mb-3">Productos</h3>
            <div className="space-y-2">
              {(order.items ?? []).map((item) => (
                <div key={item.productId} className="flex justify-between text-sm">
                  <div>
                    <div className="font-medium">{item.productName}</div>
                    <div className="text-muted-foreground">
                      {item.quantity} x {formatPrice(item.unitPrice)}
                    </div>
                  </div>
                  <div className="font-medium">{formatPrice(item.subtotal)}</div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Envío</span>
              <span className="font-medium">
                {order.shippingCost === 0 ? (
                  <span className="text-green-600">Gratis</span>
                ) : (
                  formatPrice(order.shippingCost)
                )}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </div>

          <Separator />

          {/* Shipping Info */}
          <div>
            <h3 className="font-medium mb-2">Dirección de envío</h3>
            <div className="text-sm text-muted-foreground">
              {order.shippingAddress ? (
                <>
                  <div>
                    {order.shippingAddress.street} {order.shippingAddress.streetNumber}
                    {order.shippingAddress.floor && `, Piso ${order.shippingAddress.floor}`}
                    {order.shippingAddress.apartment && ` Dpto ${order.shippingAddress.apartment}`}
                  </div>
                  <div>
                    {order.shippingAddress.city}, {order.shippingAddress.province}
                  </div>
                  <div>CP {order.shippingAddress.postcode}</div>
                </>
              ) : (
                <div>Sin información de dirección</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button asChild size="lg">
          <Link href="/cuenta/pedidos">Ver mis pedidos</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/productos">Seguir comprando</Link>
        </Button>
      </div>

      {/* Info */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>Te enviamos un email con los detalles de tu pedido</p>
        <p className="mt-1">Podés hacer seguimiento desde tu cuenta</p>
      </div>
    </div>
  );
}
