/**
 * Order Confirmation Page
 * /confirmacion/[orderId]
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fake_getOrderById } from '@/lib/mock/services';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Package } from 'lucide-react';
import { formatPrice, formatDateTime } from '@/lib/formatters';

export const metadata: Metadata = {
  title: 'Pedido confirmado',
  description: 'Tu pedido ha sido confirmado exitosamente'
};

interface OrderConfirmationPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderId } = await params;

  const response = await fake_getOrderById(orderId);

  if (!response.success || !response.data) {
    notFound();
  }

  const order = response.data;

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
            Pedido {order.order_number}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Estado:</span>
              <div className="font-medium mt-1">
                {order.status === 'pending' && 'Pendiente de pago'}
                {order.status === 'processing' && 'En preparación'}
                {order.status === 'shipped' && 'Enviado'}
                {order.status === 'delivered' && 'Entregado'}
                {order.status === 'cancelled' && 'Cancelado'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha:</span>
              <div className="font-medium mt-1">{formatDateTime(order.created_at)}</div>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <h3 className="font-medium mb-3">Productos</h3>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <div>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="text-muted-foreground">
                      {item.quantity} x {formatPrice(item.unit_price)}
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
                {order.shipping_cost === 0 ? (
                  <span className="text-green-600">Gratis</span>
                ) : (
                  formatPrice(order.shipping_cost)
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
              <div>
                {order.shipping_address.street} {order.shipping_address.street_number}
                {order.shipping_address.floor && `, Piso ${order.shipping_address.floor}`}
                {order.shipping_address.apartment && ` Dpto ${order.shipping_address.apartment}`}
              </div>
              <div>
                {order.shipping_address.city}, {order.shipping_address.province}
              </div>
              <div>CP {order.shipping_address.postcode}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button asChild size="lg">
          <Link href="/">Ir a inicio</Link>
        </Button>
        {/* TODO: Link to orders page when implemented */}
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
