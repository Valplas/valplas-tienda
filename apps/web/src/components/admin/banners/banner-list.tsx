'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Edit,
  GripVertical,
  Loader2,
  MousePointerClick,
  Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { describeBannerLink, getBannerStatus, type BannerStatusTone } from '@/lib/banners';
import type { AdminBanner } from '@/types';

interface BannerListProps {
  banners: AdminBanner[];
  /** Ids en el nuevo orden (lista completa) */
  onReorder: (bannerIds: string[]) => void;
  onToggleActive: (banner: AdminBanner, isActive: boolean) => Promise<void>;
  onEdit: (banner: AdminBanner) => void;
  onDelete: (banner: AdminBanner) => void;
  reordering?: boolean;
}

const STATUS_CLASSES: Record<BannerStatusTone, string> = {
  visible: 'bg-green-600 text-white hover:bg-green-600',
  scheduled: 'bg-amber-500 text-white hover:bg-amber-500',
  hidden: ''
};

/**
 * Qué pasa al tocar el banner *hoy*: un destino desactivado no cuenta (el
 * público recibe null), igual que en GET /api/banners.
 */
function linkInfo(banner: AdminBanner) {
  const product = banner.linkProductIsActive ? banner.linkProductName : null;
  const category = banner.linkCategoryIsActive ? banner.linkCategoryName : null;
  const brand = banner.linkBrandIsActive ? banner.linkBrandName : null;

  const inactive = [
    banner.linkProductIsActive === false && `el producto «${banner.linkProductName}»`,
    banner.linkCategoryIsActive === false && `la categoría «${banner.linkCategoryName}»`,
    banner.linkBrandIsActive === false && `la marca «${banner.linkBrandName}»`
  ].filter(Boolean);

  return {
    summary: describeBannerLink({ productName: product, categoryName: category, brandName: brand }),
    warning: inactive.length > 0 ? `Está desactivado ${inactive.join(' y ')}.` : null
  };
}

interface BannerListItemProps extends Omit<BannerListProps, 'banners' | 'onReorder'> {
  banner: AdminBanner;
  position: number;
  total: number;
  onMove: (from: number, to: number) => void;
}

function BannerListItem({
  banner,
  position,
  total,
  onMove,
  onToggleActive,
  onEdit,
  onDelete,
  reordering
}: BannerListItemProps) {
  const [toggling, setToggling] = React.useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: banner.id, disabled: reordering });

  const status = getBannerStatus(banner);
  const { summary, warning } = linkInfo(banner);
  const index = position - 1;

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await onToggleActive(banner, checked);
    } finally {
      setToggling(false);
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex gap-2 rounded-lg border bg-card p-3 sm:gap-3',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-primary'
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={reordering}
          aria-label={`Arrastrar para reordenar ${banner.title}`}
          className="flex h-9 w-7 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{position}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex gap-3">
          <div className="relative aspect-[3/1] w-28 shrink-0 overflow-hidden rounded border bg-muted sm:w-44">
            <Image
              src={banner.desktopImageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 176px, 112px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{banner.title}</p>
            <Badge
              variant={status.tone === 'hidden' ? 'outline' : 'default'}
              className={STATUS_CLASSES[status.tone]}
            >
              {status.label}
            </Badge>
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick className="mt-px h-3.5 w-3.5 shrink-0" />
          {summary}
        </p>
        {warning && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {warning}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={banner.isActive}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label={`Mostrar ${banner.title} en la tienda`}
            />
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span>{banner.isActive ? 'Activo' : 'Apagado'}</span>
            )}
          </label>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onMove(index, index - 1)}
              disabled={reordering || index === 0}
              aria-label="Subir"
              title="Subir"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onMove(index, index + 1)}
              disabled={reordering || index === total - 1}
              aria-label="Bajar"
              title="Bajar"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onEdit(banner)}
              aria-label="Editar"
              title="Editar"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(banner)}
              aria-label="Eliminar"
              title="Eliminar"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Lista ordenable: arrastrar desde la manija o usar las flechas. */
export function BannerList({ banners, onReorder, ...itemProps }: BannerListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = React.useMemo(() => banners.map((banner) => banner.id), [banners]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <DndContext
      id="banner-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-3">
          {banners.map((banner, index) => (
            <BannerListItem
              key={banner.id}
              banner={banner}
              position={index + 1}
              total={banners.length}
              onMove={move}
              {...itemProps}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
