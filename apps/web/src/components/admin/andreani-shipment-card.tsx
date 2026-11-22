'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Loader2, RefreshCw, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { ShipmentStatusBadge } from '@/components/admin/shipment-status-badge';
import { CreateShipmentDialog } from '@/components/admin/create-shipment-dialog';
import { ShipmentTimeline } from '@/components/shipments/shipment-timeline';
import type { Order } from '@/lib/services/orders.service';
import {
  cancelShipment,
  discardShipment,
  downloadShipmentLabel,
  getShipmentsConfig,
  refreshShipment,
  type Shipment
} from '@/lib/services/shipments.service';

const NON_BLOCKING_STATUSES = ['cancelled', 'rejected', 'error', 'expired'];
const CREATABLE_ORDER_STATUSES = ['payment_confirmed', 'processing', 'ready_to_ship'];
const DISCARDABLE_STATUSES = ['requesting', 'cancelling'];
const BLOB_REVOKE_DELAY_MS = 60_000;

interface AndreaniShipmentCardProps {
  order: Order;
  onChanged: () => void;
}

function latestFirst(shipments: Shipment[]): Shipment[] {
  return [...shipments].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export function AndreaniShipmentCard({ order, onChanged }: AndreaniShipmentCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // null mientras carga o si la consulta falla: en ese caso no se oculta nada.
  const [integrationEnabled, setIntegrationEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShipmentsConfig()
      .then((cfg) => {
        if (!cancelled) setIntegrationEnabled(cfg.enabled);
      })
      .catch(() => {
        if (!cancelled) setIntegrationEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shipments = latestFirst(order.shipments ?? []);
  const latest = shipments[0];
  const active = shipments.find((s) => !NON_BLOCKING_STATUSES.includes(s.status));
  const errorShipment = !active && latest?.status === 'error' ? latest : undefined;
  const integrationDisabled = integrationEnabled === false;
  const canCreate =
    !active && !integrationDisabled && CREATABLE_ORDER_STATUSES.includes(order.status);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Número de seguimiento copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleDownload = async (shipment: Shipment) => {
    setDownloading(true);
    try {
      const blob = await downloadShipmentLabel(shipment.id);
      const url = URL.createObjectURL(blob);
      // Link con download en vez de window.open: después de un await los bloqueadores de
      // popups cancelan la ventana.
      const link = document.createElement('a');
      link.href = url;
      link.download = `etiqueta-${order.orderNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_DELAY_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar la etiqueta');
    } finally {
      setDownloading(false);
    }
  };

  const handleRefresh = async (shipment: Shipment) => {
    setRefreshing(true);
    try {
      await refreshShipment(shipment.id);
      toast.success('Tracking actualizado');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar el envío');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancel = async (shipment: Shipment) => {
    setCancelling(true);
    try {
      await cancelShipment(shipment.id);
      toast.success('Cancelación solicitada');
      setCancelOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar el envío');
    } finally {
      setCancelling(false);
    }
  };

  const handleDiscard = async (shipment: Shipment) => {
    setDiscarding(true);
    try {
      await discardShipment(shipment.id);
      toast.success('Envío descartado');
      setDiscardOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descartar el envío');
    } finally {
      setDiscarding(false);
    }
  };

  const busy = downloading || refreshing || cancelling || discarding;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Envío Andreani
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ShipmentStatusBadge status={active.status} />
              {active.destinationBranch && (
                <span className="text-sm text-muted-foreground">
                  Sucursal destino: {active.destinationBranch.name} (
                  {active.destinationBranch.address}, {active.destinationBranch.city})
                </span>
              )}
            </div>

            {active.trackingNumber && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Seguimiento:</span>
                <span className="font-mono">{active.trackingNumber}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Copiar número de seguimiento"
                  onClick={() => handleCopy(active.trackingNumber as string)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {active.trackingUrl && (
                  <a
                    href={active.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Ver seguimiento
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="outline" onClick={() => handleDownload(active)} disabled={busy}>
                {downloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {downloading ? 'Procesando...' : 'Descargar etiqueta'}
              </Button>
              <Button variant="outline" onClick={() => handleRefresh(active)} disabled={busy}>
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {refreshing ? 'Procesando...' : 'Actualizar tracking'}
              </Button>
              {(active.status === 'pending' || active.status === 'created') && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                  disabled={busy}
                >
                  Cancelar envío
                </Button>
              )}
              {DISCARDABLE_STATUSES.includes(active.status) && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDiscardOpen(true)}
                  disabled={busy}
                >
                  Descartar
                </Button>
              )}
            </div>

            <Separator />
            <ShipmentTimeline events={active.events ?? []} />

            <AlertDialog open={cancelOpen} onOpenChange={(o) => !cancelling && setCancelOpen(o)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar envío</AlertDialogTitle>
                  <AlertDialogDescription>
                    ¿Estás seguro de cancelar el envío Andreani? Se anulará la etiqueta generada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleCancel(active);
                    }}
                    disabled={cancelling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {cancelling ? 'Procesando...' : 'Cancelar envío'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={discardOpen} onOpenChange={(o) => !discarding && setDiscardOpen(o)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Descartar envío</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto solo descarta el envío en Valplas y libera el pedido. Andreani no es
                    notificado: el envío puede seguir existiendo en su portal. Verificalo y, si
                    existe, cancelalo ahí antes de generar uno nuevo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={discarding}>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleDiscard(active);
                    }}
                    disabled={discarding}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {discarding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {discarding ? 'Procesando...' : 'Descartar envío'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            {errorShipment ? (
              <p className="text-sm text-destructive">
                {errorShipment.errorMessage ?? 'Error al generar el envío'}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin envío Andreani generado.</p>
            )}
            {integrationDisabled && (
              <p className="text-sm text-muted-foreground">
                Integración con Andreani deshabilitada
              </p>
            )}
            {canCreate && (
              <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
                {errorShipment ? 'Reintentar' : 'Crear envío Andreani'}
              </Button>
            )}
          </>
        )}
      </CardContent>

      <CreateShipmentDialog
        orderId={order.id}
        postcode={order.shippingAddress?.postcode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onChanged}
      />
    </Card>
  );
}
