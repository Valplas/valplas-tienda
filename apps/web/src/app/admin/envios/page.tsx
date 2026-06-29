'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { Pencil, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/formatters';
import {
  getShippingZonesAdmin,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
  getCarriersAdmin,
  createCarrier,
  updateCarrier,
  deleteCarrier,
  getRatesAdmin,
  createRate,
  updateRate,
  deleteRate,
  type AdminZone,
  type AdminCarrier,
  type AdminRate
} from '@/services';
import { ShippingZoneForm } from '@/components/admin/shipping-zone-form';
import { CarrierForm } from '@/components/admin/carrier-form';
import { RateForm } from '@/components/admin/rate-form';
import { ShippingZoneFormData, CarrierFormData, RateFormData } from '@/lib/validations/shipping';
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

const PAGE_LIMIT = 100;

function splitCsv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function EnviosPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  // Data
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [carriers, setCarriers] = useState<AdminCarrier[]>([]);
  const [rates, setRates] = useState<AdminRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Sheets
  const [selectedZone, setSelectedZone] = useState<AdminZone | null>(null);
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);

  const [selectedCarrier, setSelectedCarrier] = useState<AdminCarrier | null>(null);
  const [carrierSheetOpen, setCarrierSheetOpen] = useState(false);
  const [carrierSaving, setCarrierSaving] = useState(false);

  const [selectedRate, setSelectedRate] = useState<AdminRate | null>(null);
  const [rateSheetOpen, setRateSheetOpen] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'zone' | 'carrier' | 'rate';
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Recursos independientes → Promise.all permitido
      const [z, c, r] = await Promise.all([
        getShippingZonesAdmin({ limit: PAGE_LIMIT }),
        getCarriersAdmin({ limit: PAGE_LIMIT }),
        getRatesAdmin({ limit: PAGE_LIMIT })
      ]);
      setZones(z.zones);
      setCarriers(c.carriers);
      setRates(r.rates);
    } catch {
      toast.error('Error al cargar datos de envío');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);
  const carrierName = useMemo(() => new Map(carriers.map((c) => [c.id, c.name])), [carriers]);

  // ── Zone handlers ──
  const handleZoneSubmit = async (data: ShippingZoneFormData) => {
    setZoneSaving(true);
    try {
      const body = {
        name: data.name,
        provinces: splitCsv(data.provinces),
        excluded_postcodes: splitCsv(data.excludedPostcodes),
        is_active: data.isActive
      };
      if (selectedZone) {
        await updateShippingZone(selectedZone.id, body);
        toast.success('Zona actualizada');
      } else {
        await createShippingZone(body);
        toast.success('Zona creada');
      }
      setZoneSheetOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar zona');
    } finally {
      setZoneSaving(false);
    }
  };

  // ── Carrier handlers ──
  const handleCarrierSubmit = async (data: CarrierFormData) => {
    setCarrierSaving(true);
    try {
      const body = {
        name: data.name,
        code: data.code,
        logo_url: data.logoUrl || undefined,
        is_active: data.isActive
      };
      if (selectedCarrier) {
        await updateCarrier(selectedCarrier.id, body);
        toast.success('Carrier actualizado');
      } else {
        await createCarrier(body);
        toast.success('Carrier creado');
      }
      setCarrierSheetOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar carrier');
    } finally {
      setCarrierSaving(false);
    }
  };

  // ── Rate handlers ──
  const handleRateSubmit = async (data: RateFormData) => {
    setRateSaving(true);
    try {
      const body = {
        zone_id: data.zoneId,
        carrier_id: data.carrierId,
        min_amount: data.minAmount,
        max_amount: data.maxAmount,
        price: data.price,
        estimated_days_min: data.estimatedDaysMin,
        estimated_days_max: data.estimatedDaysMax,
        is_active: data.isActive
      };
      if (selectedRate) {
        await updateRate(selectedRate.id, body);
        toast.success('Tarifa actualizada');
      } else {
        await createRate(body);
        toast.success('Tarifa creada');
      }
      setRateSheetOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar tarifa');
    } finally {
      setRateSaving(false);
    }
  };

  // ── Delete ──
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'zone') await deleteShippingZone(deleteTarget.id);
      else if (deleteTarget.type === 'carrier') await deleteCarrier(deleteTarget.id);
      else await deleteRate(deleteTarget.id);
      toast.success('Eliminado correctamente');
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const toggleZone = (id: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Envíos</h1>
        <p className="text-muted-foreground mt-2">Gestioná zonas, carriers y tarifas de envío</p>
      </div>

      {/* ── Zonas ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Zonas de Envío</h2>
          <Button
            onClick={() => {
              setSelectedZone(null);
              setZoneSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Zona
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : zones.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No hay zonas configuradas
            </div>
          ) : (
            zones.map((zone) => (
              <div key={zone.id} className="border rounded-md">
                <div className="flex items-center gap-4 p-4">
                  <button
                    onClick={() => toggleZone(zone.id)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    {expandedZones.has(zone.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1">
                    <h3 className="font-medium">{zone.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {zone.provinces.length} provincia{zone.provinces.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Badge variant={zone.isActive ? 'default' : 'secondary'}>
                    {zone.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setSelectedZone(zone);
                        setZoneSheetOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() =>
                        setDeleteTarget({ type: 'zone', id: zone.id, name: zone.name })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expandedZones.has(zone.id) && (
                  <div className="border-t p-4 bg-muted/30 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Provincias:</h4>
                      <div className="flex flex-wrap gap-2">
                        {zone.provinces.map((p, i) => (
                          <Badge key={i} variant="outline">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {zone.excludedPostcodes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">CP excluidos:</h4>
                        <div className="flex flex-wrap gap-2">
                          {zone.excludedPostcodes.map((c, i) => (
                            <Badge key={i} variant="outline">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Carriers ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Carriers</h2>
          <Button
            onClick={() => {
              setSelectedCarrier(null);
              setCarrierSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Carrier
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : carriers.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No hay carriers configurados
            </div>
          ) : (
            carriers.map((c) => (
              <div key={c.id} className="border rounded-md flex items-center gap-4 p-4">
                <div className="flex-1">
                  <h3 className="font-medium">{c.name}</h3>
                  <p className="text-sm text-muted-foreground">{c.code}</p>
                </div>
                <Badge variant={c.isActive ? 'default' : 'secondary'}>
                  {c.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setSelectedCarrier(c);
                      setCarrierSheetOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTarget({ type: 'carrier', id: c.id, name: c.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Tarifas ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tarifas</h2>
          <Button
            disabled={zones.length === 0 || carriers.length === 0}
            onClick={() => {
              setSelectedRate(null);
              setRateSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </div>

        {zones.length === 0 || carriers.length === 0 ? (
          <div className="border rounded-md p-4 text-sm text-muted-foreground">
            Creá al menos una zona y un carrier para poder cargar tarifas.
          </div>
        ) : null}

        <div className="space-y-2">
          {loading ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              Cargando...
            </div>
          ) : rates.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No hay tarifas configuradas
            </div>
          ) : (
            rates.map((r) => (
              <div key={r.id} className="border rounded-md flex items-center gap-4 p-4">
                <div className="flex-1">
                  <h3 className="font-medium">
                    {zoneName.get(r.zoneId) ?? 'Zona'} · {carrierName.get(r.carrierId) ?? 'Carrier'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Desde {formatPrice(r.minAmount)} · Precio {formatPrice(r.price)}
                    {r.maxAmount != null && ` · Gratis desde ${formatPrice(r.maxAmount)}`} ·{' '}
                    {r.estimatedDaysMin}-{r.estimatedDaysMax} días
                  </p>
                </div>
                <Badge variant={r.isActive ? 'default' : 'secondary'}>
                  {r.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setSelectedRate(r);
                      setRateSheetOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() =>
                      setDeleteTarget({
                        type: 'rate',
                        id: r.id,
                        name: `${zoneName.get(r.zoneId) ?? ''} / ${carrierName.get(r.carrierId) ?? ''}`
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Zone Sheet */}
      <Sheet open={zoneSheetOpen} onOpenChange={setZoneSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedZone ? 'Editar Zona' : 'Nueva Zona'}</SheetTitle>
            <SheetDescription>Configurá la zona de envío</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ShippingZoneForm
              zone={selectedZone || undefined}
              onSubmit={handleZoneSubmit}
              onCancel={() => setZoneSheetOpen(false)}
              isLoading={zoneSaving}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Carrier Sheet */}
      <Sheet open={carrierSheetOpen} onOpenChange={setCarrierSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedCarrier ? 'Editar Carrier' : 'Nuevo Carrier'}</SheetTitle>
            <SheetDescription>Configurá el transportista</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <CarrierForm
              carrier={selectedCarrier || undefined}
              onSubmit={handleCarrierSubmit}
              onCancel={() => setCarrierSheetOpen(false)}
              isLoading={carrierSaving}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Rate Sheet */}
      <Sheet open={rateSheetOpen} onOpenChange={setRateSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedRate ? 'Editar Tarifa' : 'Nueva Tarifa'}</SheetTitle>
            <SheetDescription>Configurá la tarifa de envío</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <RateForm
              rate={selectedRate || undefined}
              zones={zones}
              carriers={carriers}
              onSubmit={handleRateSubmit}
              onCancel={() => setRateSheetOpen(false)}
              isLoading={rateSaving}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
