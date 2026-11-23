import { Badge } from '@/components/ui/badge';
import { SHIPMENT_ISSUE_STATUSES, SHIPMENT_STATUS_LABELS } from '@/lib/shipment-status';
import type { ShipmentStatus } from '@/lib/services/shipments.service';

const AMBER_STATUSES: readonly ShipmentStatus[] = ['delivery_failed', 'returning', 'returned'];
const WAITING_STATUSES: readonly ShipmentStatus[] = ['requesting', 'pending', 'cancelling'];

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const label = SHIPMENT_STATUS_LABELS[status] ?? status;

  if (AMBER_STATUSES.includes(status)) {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-600">{label}</Badge>;
  }
  if (SHIPMENT_ISSUE_STATUSES.includes(status)) {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (WAITING_STATUSES.includes(status)) {
    return (
      <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700">
        {label}
      </Badge>
    );
  }
  if (status === 'cancelled') {
    return <Badge className="bg-gray-500 text-white hover:bg-gray-600">{label}</Badge>;
  }
  if (status === 'delivered') {
    return <Badge className="bg-green-500 hover:bg-green-600">{label}</Badge>;
  }
  return <Badge className="bg-indigo-500 hover:bg-indigo-600">{label}</Badge>;
}
