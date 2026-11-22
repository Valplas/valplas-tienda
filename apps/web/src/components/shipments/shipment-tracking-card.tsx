import { ExternalLink, MapPin, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShipmentTimeline } from '@/components/shipments/shipment-timeline';
import { SHIPMENT_STATUS_LABELS } from '@/lib/shipment-status';
import { formatDate } from '@/lib/formatters';
import type { Shipment } from '@/lib/services/shipments.service';

export function ShipmentTrackingCard({ shipment }: { shipment: Shipment }) {
  const branch = shipment.destinationBranch;
  const isPickup = shipment.serviceType === 'branch_pickup';
  const delivered = shipment.status === 'delivered';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          <Truck className="h-5 w-5" />
          Seguimiento del envío
        </CardTitle>
        <p className="text-2xl font-bold leading-tight sm:text-3xl">
          {SHIPMENT_STATUS_LABELS[shipment.status] ?? shipment.status}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {shipment.trackingNumber && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Nº de seguimiento</p>
              <p className="break-all font-mono text-base">{shipment.trackingNumber}</p>
            </div>
            {shipment.trackingUrl && (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Seguir en Andreani
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        )}

        {isPickup && branch && (
          <div className="rounded-md border p-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <MapPin className="h-4 w-4" />
              Retiro en sucursal: {branch.name}
            </p>
            <p>{branch.address}</p>
            <p className="text-muted-foreground">
              {branch.city}, {branch.province} (CP {branch.postcode})
            </p>
            {branch.hours && <p className="mt-1 text-muted-foreground">Horario: {branch.hours}</p>}
          </div>
        )}

        {!delivered && shipment.estimatedDeliveryAt && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Entrega estimada</p>
            <p className="text-base">{formatDate(shipment.estimatedDeliveryAt)}</p>
          </div>
        )}

        {delivered && shipment.deliveredAt && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Entregado el</p>
            <p className="text-base">{formatDate(shipment.deliveredAt)}</p>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Historial</p>
          <ShipmentTimeline events={shipment.events ?? []} />
        </div>
      </CardContent>
    </Card>
  );
}
