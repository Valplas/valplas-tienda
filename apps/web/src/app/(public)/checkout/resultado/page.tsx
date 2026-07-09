'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { getOrderByNumber } from '@/services';
import type { Order } from '@/lib/services/orders.service';

// MP appends: collection_status, external_reference, payment_id, status, merchant_order_id
// We read collection_status (approved | rejected | pending | in_process)
// and external_reference (orderNumber)

type MPStatus = 'approved' | 'rejected' | 'pending' | 'in_process';

function StatusIcon({ status }: { status: MPStatus | null }) {
  if (status === 'approved')
    return (
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
    );
  if (status === 'pending' || status === 'in_process')
    return (
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100">
        <Clock className="w-10 h-10 text-yellow-600" />
      </div>
    );
  return (
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
      <XCircle className="w-10 h-10 text-red-600" />
    </div>
  );
}

function StatusText({ status }: { status: MPStatus | null }) {
  if (status === 'approved')
    return (
      <>
        <h1 className="text-2xl font-bold mb-2">¡Pago aprobado!</h1>
        <p className="text-muted-foreground">Tu pedido fue confirmado y lo estamos preparando.</p>
      </>
    );
  if (status === 'pending' || status === 'in_process')
    return (
      <>
        <h1 className="text-2xl font-bold mb-2">Pago en proceso</h1>
        <p className="text-muted-foreground">
          Tu pago está siendo procesado. Te notificaremos cuando se confirme.
        </p>
      </>
    );
  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Pago rechazado</h1>
      <p className="text-muted-foreground">
        No pudimos procesar tu pago. Podés intentarlo nuevamente.
      </p>
    </>
  );
}

function CheckoutResultadoContent() {
  const searchParams = useSearchParams();
  const status = (searchParams.get('collection_status') ??
    searchParams.get('status')) as MPStatus | null;
  const orderNumber = searchParams.get('external_reference');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!!orderNumber);

  useEffect(() => {
    // loading ya inicializa en !!orderNumber, así que cuando no hay orderNumber
    // ya vale false. No hace falta setState síncrono dentro del effect.
    if (!orderNumber) return;
    getOrderByNumber(orderNumber)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  // El webhook de MP tarda unos segundos en confirmar la orden después del
  // redirect: mientras siga pending_payment, re-consultar hasta ~30s.
  useEffect(() => {
    if (!orderNumber || !order || order.status !== 'pending_payment') return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts > 10) {
        clearInterval(interval);
        return;
      }
      try {
        const updated = await getOrderByNumber(orderNumber);
        if (updated.status !== 'pending_payment') {
          setOrder(updated);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [orderNumber, order]);

  return (
    <div className="container mx-auto max-w-lg py-16">
      <div className="text-center mb-8 space-y-3">
        <StatusIcon status={status} />
        <StatusText status={status} />
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && order && (
        <Card className="mb-6">
          <CardContent className="p-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pedido</span>
              <span className="font-medium">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
                  order.total
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado</span>
              <span className="font-medium">
                {order.status === 'payment_confirmed' && 'Pago confirmado'}
                {order.status === 'pending_payment' && 'Pendiente de pago'}
                {order.status === 'failed' && 'Pago fallido'}
                {order.status === 'processing' && 'En preparación'}
                {!['payment_confirmed', 'pending_payment', 'failed', 'processing'].includes(
                  order.status
                ) && order.status}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {status === 'approved' && order && (
          <Button asChild size="lg">
            <Link href={`/confirmacion/${order.id}`}>Ver detalle del pedido</Link>
          </Button>
        )}
        {(status === 'rejected' || !status) && (
          <Button asChild size="lg">
            <Link href="/checkout">Reintentar pago</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href="/cuenta/pedidos">Mis pedidos</Link>
        </Button>
      </div>

      {(status === 'pending' || status === 'in_process') && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          Una vez confirmado el pago, recibirás un email con los detalles del pedido.
        </p>
      )}
    </div>
  );
}

export default function CheckoutResultadoPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-lg py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CheckoutResultadoContent />
    </Suspense>
  );
}
