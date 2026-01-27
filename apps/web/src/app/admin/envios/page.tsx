'use client';

import { useState, useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable, createCheckboxColumn } from '@/components/admin/data-table';
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
import { ShippingZone } from '@/types';
import {
  fake_getShippingZones,
  fake_createShippingZone,
  fake_updateShippingZone,
  fake_deleteShippingZone,
  fake_getCarriers,
  fake_createCarrier,
  fake_updateCarrier,
  fake_deleteCarrier,
  type Carrier
} from '@/lib/mock/services/fake-shipping-admin.service';
import { ShippingZoneForm } from '@/components/admin/shipping-zone-form';
import { CarrierForm } from '@/components/admin/carrier-form';
import { ShippingZoneFormData, CarrierFormData } from '@/lib/validations/shipping';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function EnviosPage() {
  // Zones state
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<ShippingZone | null>(null);
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Carriers state
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null);
  const [carrierSheetOpen, setCarrierSheetOpen] = useState(false);
  const [carrierSaving, setCarrierSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'zone' | 'carrier';
    id: string;
    name: string;
  } | null>(null);

  // Load zones
  useEffect(() => {
    loadZones();
  }, []);

  // Load carriers
  useEffect(() => {
    loadCarriers();
  }, []);

  async function loadZones() {
    setZonesLoading(true);
    const response = await fake_getShippingZones();
    if (response.success && response.data) {
      setZones(response.data);
    }
    setZonesLoading(false);
  }

  async function loadCarriers() {
    setCarriersLoading(true);
    const response = await fake_getCarriers();
    if (response.success && response.data) {
      setCarriers(response.data);
    }
    setCarriersLoading(false);
  }

  // Zone handlers
  const handleCreateZone = () => {
    setSelectedZone(null);
    setZoneSheetOpen(true);
  };

  const handleEditZone = (zone: ShippingZone) => {
    setSelectedZone(zone);
    setZoneSheetOpen(true);
  };

  const handleZoneSubmit = async (data: ShippingZoneFormData) => {
    setZoneSaving(true);

    try {
      if (selectedZone) {
        const response = await fake_updateShippingZone(selectedZone.id, data);
        if (response.success) {
          toast.success('Zona actualizada correctamente');
          await loadZones();
          setZoneSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al actualizar zona');
        }
      } else {
        const response = await fake_createShippingZone(data);
        if (response.success) {
          toast.success('Zona creada correctamente');
          await loadZones();
          setZoneSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al crear zona');
        }
      }
    } finally {
      setZoneSaving(false);
    }
  };

  const handleDeleteZone = (zone: ShippingZone) => {
    setDeleteTarget({ type: 'zone', id: zone.id, name: zone.name });
    setDeleteDialogOpen(true);
  };

  // Carrier handlers
  const handleCreateCarrier = () => {
    setSelectedCarrier(null);
    setCarrierSheetOpen(true);
  };

  const handleEditCarrier = (carrier: Carrier) => {
    setSelectedCarrier(carrier);
    setCarrierSheetOpen(true);
  };

  const handleCarrierSubmit = async (data: CarrierFormData) => {
    setCarrierSaving(true);

    try {
      if (selectedCarrier) {
        const response = await fake_updateCarrier(selectedCarrier.id, data);
        if (response.success) {
          toast.success('Carrier actualizado correctamente');
          await loadCarriers();
          setCarrierSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al actualizar carrier');
        }
      } else {
        const response = await fake_createCarrier(data);
        if (response.success) {
          toast.success('Carrier creado correctamente');
          await loadCarriers();
          setCarrierSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al crear carrier');
        }
      }
    } finally {
      setCarrierSaving(false);
    }
  };

  const handleDeleteCarrier = (carrier: Carrier) => {
    setDeleteTarget({ type: 'carrier', id: carrier.id, name: carrier.name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'zone') {
      const response = await fake_deleteShippingZone(deleteTarget.id);
      if (response.success) {
        toast.success('Zona eliminada correctamente');
        await loadZones();
      } else {
        toast.error(response.error?.message || 'Error al eliminar zona');
      }
    } else {
      const response = await fake_deleteCarrier(deleteTarget.id);
      if (response.success) {
        toast.success('Carrier eliminado correctamente');
        await loadCarriers();
      } else {
        toast.error(response.error?.message || 'Error al eliminar carrier');
      }
    }

    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const toggleZoneExpansion = (zoneId: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  };

  // Zone columns
  const zoneColumns = useMemo<ColumnDef<ShippingZone>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={() => toggleZoneExpansion(row.original.id)}
            className="p-1 hover:bg-muted rounded"
          >
            {expandedZones.has(row.original.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ),
        enableSorting: false
      },
      {
        accessorKey: 'name',
        header: 'Zona'
      },
      {
        id: 'postcodes_count',
        header: 'Códigos Postales',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.postcodes.length} código{row.original.postcodes.length !== 1 ? 's' : ''}
          </span>
        )
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default">Activa</Badge>
          ) : (
            <Badge variant="secondary">Inactiva</Badge>
          )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditZone(row.original)}
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteZone(row.original)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false
      }
    ],
    [expandedZones]
  );

  // Carrier columns
  const carrierColumns = useMemo<ColumnDef<Carrier>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Carrier'
      },
      {
        accessorKey: 'base_rate',
        header: 'Tarifa Base',
        cell: ({ row }) =>
          new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS'
          }).format(row.original.base_rate)
      },
      {
        accessorKey: 'estimated_days',
        header: 'Días Estimados',
        cell: ({ row }) =>
          `${row.original.estimated_days} día${row.original.estimated_days !== 1 ? 's' : ''}`
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default">Activo</Badge>
          ) : (
            <Badge variant="secondary">Inactivo</Badge>
          )
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditCarrier(row.original)}
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteCarrier(row.original)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false
      }
    ],
    []
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Envíos</h1>
        <p className="text-muted-foreground mt-2">Gestioná zonas de envío y carriers disponibles</p>
      </div>

      {/* Shipping Zones Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Zonas de Envío</h2>
          <Button onClick={handleCreateZone}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Zona
          </Button>
        </div>

        <div className="space-y-2">
          {zonesLoading ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              Cargando zonas...
            </div>
          ) : zones.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No hay zonas de envío configuradas
            </div>
          ) : (
            zones.map((zone) => (
              <div key={zone.id} className="border rounded-md">
                <div className="flex items-center gap-4 p-4">
                  <button
                    onClick={() => toggleZoneExpansion(zone.id)}
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
                      {zone.postcodes.length} código{zone.postcodes.length !== 1 ? 's' : ''} postal
                      {zone.postcodes.length !== 1 ? 'es' : ''}
                    </p>
                  </div>
                  {zone.is_active ? (
                    <Badge variant="default">Activa</Badge>
                  ) : (
                    <Badge variant="secondary">Inactiva</Badge>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditZone(zone)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteZone(zone)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expandedZones.has(zone.id) && (
                  <div className="border-t p-4 bg-muted/30">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Códigos Postales:</h4>
                      <div className="flex flex-wrap gap-2">
                        {zone.postcodes.map((code, i) => (
                          <Badge key={i} variant="outline">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Carriers Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Carriers</h2>
          <Button onClick={handleCreateCarrier}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Carrier
          </Button>
        </div>

        <DataTable
          data={carriers}
          columns={carrierColumns}
          searchKey="name"
          searchPlaceholder="Buscar carrier..."
          isLoading={carriersLoading}
          getRowId={(row) => row.id}
        />
      </section>

      {/* Zone Sheet */}
      <Sheet open={zoneSheetOpen} onOpenChange={setZoneSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedZone ? 'Editar Zona' : 'Nueva Zona'}</SheetTitle>
            <SheetDescription>
              {selectedZone
                ? 'Actualizá los datos de la zona de envío'
                : 'Creá una nueva zona de envío'}
            </SheetDescription>
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
            <SheetDescription>
              {selectedCarrier
                ? 'Actualizá los datos del carrier'
                : 'Creá un nuevo carrier de envío'}
            </SheetDescription>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que querés eliminar{' '}
              {deleteTarget?.type === 'zone' ? 'la zona' : 'el carrier'}{' '}
              <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
