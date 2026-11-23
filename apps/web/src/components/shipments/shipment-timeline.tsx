import dayjs from 'dayjs';
import type { ShipmentEvent } from '@/lib/services/shipments.service';
import { cn } from '@/lib/utils';

interface ShipmentTimelineProps {
  events: ShipmentEvent[];
  compact?: boolean;
}

export function ShipmentTimeline({ events, compact = false }: ShipmentTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin eventos todavía</p>;
  }

  const sorted = [...events].sort(
    (a, b) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf()
  );

  return (
    <ol className="space-y-3">
      {sorted.map((ev, index) => {
        const subtitle = [ev.reason, ev.branchName].filter(Boolean).join(' · ');
        return (
          <li key={`${ev.occurredAt}-${ev.event}-${index}`} className="flex gap-3">
            <span
              className={cn(
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                index === 0 ? 'bg-primary' : 'bg-muted-foreground/40'
              )}
            />
            <div className="min-w-0">
              <div className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
                {ev.statusLabel ?? ev.event}
              </div>
              {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
              <div className="text-xs text-muted-foreground">
                {dayjs(ev.occurredAt).format('DD/MM HH:mm')}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
