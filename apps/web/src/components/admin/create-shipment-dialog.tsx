'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  createShipment,
  getAdminPickupBranches,
  getShipmentPreview,
  type BranchSnapshot,
  type ServiceType,
  type ShipmentPreview
} from '@/lib/services/shipments.service';

interface CreateShipmentDialogProps {
  orderId: string;
  /** CP de la dirección del pedido; si falta se pide para buscar sucursales. */
  postcode?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface PackageRow {
  kilos: string;
  volumeCm3: string;
}

const MAX_B2C_KG = 50;

/** Misma regla que `channelFor` del backend: 1 bulto de hasta 50 kg => B2C. */
function channelFor(rows: PackageRow[]): 'B2C' | 'B2B' {
  if (rows.length === 1 && Number(rows[0].kilos) <= MAX_B2C_KG) return 'B2C';
  return 'B2B';
}

export function CreateShipmentDialog({
  orderId,
  postcode,
  open,
  onOpenChange,
  onCreated
}: CreateShipmentDialogProps) {
  const [requestedService, setRequestedService] = useState<ServiceType | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [preview, setPreview] = useState<ShipmentPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [localidad, setLocalidad] = useState('');
  const [postcodeInput, setPostcodeInput] = useState('');
  const [branches, setBranches] = useState<BranchSnapshot[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const requestRef = useRef(0);
  const branchesRequestRef = useRef(0);
  const rowsInitialized = useRef(false);

  const serviceType = requestedService ?? preview?.serviceType ?? 'home_delivery';
  const selectionKey = `${requestedService ?? ''}|${branchId ?? ''}`;
  const effectivePostcode = (postcode || postcodeInput).trim();

  // Reset when closing
  useEffect(() => {
    if (open) return;
    setRequestedService(undefined);
    setBranchId(undefined);
    setPreview(null);
    setPreviewKey(null);
    setPreviewError(null);
    setRows([]);
    setLocalidad('');
    setPostcodeInput('');
    setBranches([]);
    rowsInitialized.current = false;
  }, [open]);

  // Load preview (re-runs when service or branch changes)
  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setLoadingPreview(true);
    setPreviewError(null);
    getShipmentPreview(orderId, { serviceType: requestedService, branchId })
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setPreview(data);
        setPreviewKey(`${requestedService ?? ''}|${branchId ?? ''}`);
        if (!rowsInitialized.current) {
          rowsInitialized.current = true;
          setRows(
            data.packages.map((p) => ({ kilos: String(p.kilos), volumeCm3: String(p.volumeCm3) }))
          );
        }
        if (data.localidad.resolved) setLocalidad(data.localidad.resolved);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        const message = err instanceof Error ? err.message : 'Error al obtener la vista previa';
        setPreviewError(message);
        toast.error(message);
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoadingPreview(false);
      });
  }, [open, orderId, requestedService, branchId]);

  const loadBranches = useCallback(async (cp: string) => {
    const requestId = ++branchesRequestRef.current;
    setLoadingBranches(true);
    try {
      const list = await getAdminPickupBranches(cp);
      if (requestId !== branchesRequestRef.current) return;
      setBranches(list);
      setBranchId((current) =>
        current && list.some((b) => b.id === current) ? current : undefined
      );
    } catch (err) {
      if (requestId !== branchesRequestRef.current) return;
      setBranches([]);
      setBranchId(undefined);
      toast.error(err instanceof Error ? err.message : 'Error al obtener las sucursales');
    } finally {
      if (requestId === branchesRequestRef.current) setLoadingBranches(false);
    }
  }, []);

  // Auto-load branches when pickup and the order has a postcode
  useEffect(() => {
    if (open && serviceType === 'branch_pickup' && postcode) {
      loadBranches(postcode);
    }
  }, [open, serviceType, postcode, loadBranches]);

  const handleServiceChange = (value: string) => {
    setRequestedService(value as ServiceType);
    setBranchId(undefined);
  };

  const updateRow = (index: number, field: keyof PackageRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const rowsValid =
    rows.length > 0 && rows.every((r) => Number(r.kilos) > 0 && Number(r.volumeCm3) > 0);
  const canSubmit =
    !!preview &&
    previewKey === selectionKey &&
    !previewError &&
    preview.canCreate &&
    rowsValid &&
    !loadingPreview &&
    (serviceType !== 'branch_pickup' || !!branchId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const shipment = await createShipment(orderId, {
        service_type: serviceType,
        branch_id: serviceType === 'branch_pickup' ? branchId : undefined,
        localidad: localidad.trim() || undefined,
        packages: rows.map((r) => ({ kilos: Number(r.kilos), volume_cm3: Number(r.volumeCm3) }))
      });
      if (shipment.status === 'requesting') {
        toast.info('Andreani no respondió, se reintenta automáticamente');
      } else {
        toast.success('Envío Andreani creado');
      }
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el envío');
    } finally {
      setSubmitting(false);
    }
  };

  const candidates = preview?.localidad.candidates ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crear envío Andreani</DialogTitle>
          <DialogDescription>
            Revisá los datos antes de generar el envío y la etiqueta.
          </DialogDescription>
        </DialogHeader>

        {!preview && loadingPreview ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : preview ? (
          <div className="space-y-5">
            {previewError && (
              <Alert variant="destructive">
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Tipo de servicio</Label>
              <RadioGroup
                value={serviceType}
                onValueChange={handleServiceChange}
                className="flex flex-col gap-2 sm:flex-row sm:gap-6"
                disabled={submitting}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="home_delivery" id="svc-home" />
                  <Label htmlFor="svc-home">A domicilio</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="branch_pickup" id="svc-branch" />
                  <Label htmlFor="svc-branch">Retiro en sucursal</Label>
                </div>
              </RadioGroup>
            </div>

            {serviceType === 'branch_pickup' && (
              <div className="space-y-2">
                {!postcode && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Código postal"
                      value={postcodeInput}
                      onChange={(e) => {
                        setPostcodeInput(e.target.value);
                        // Invalida búsquedas en curso y la lista/selección anterior
                        branchesRequestRef.current++;
                        setLoadingBranches(false);
                        setBranches([]);
                        setBranchId(undefined);
                      }}
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loadingBranches || !effectivePostcode}
                      onClick={() => loadBranches(effectivePostcode)}
                    >
                      {loadingBranches && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {loadingBranches ? 'Procesando...' : 'Buscar sucursales'}
                    </Button>
                  </div>
                )}
                <Label>Sucursal</Label>
                <Select value={branchId ?? ''} onValueChange={setBranchId}>
                  <SelectTrigger disabled={loadingBranches || branches.length === 0}>
                    <SelectValue
                      placeholder={
                        loadingBranches
                          ? 'Cargando sucursales...'
                          : branches.length === 0
                            ? 'Sin sucursales disponibles'
                            : 'Elegí una sucursal'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} — {b.address}, {b.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bultos</Label>
                <span className="text-xs text-muted-foreground">
                  Canal {channelFor(rows)}
                  {channelFor(rows) !== preview.channel
                    ? ` · Contrato: se determina al crear (canal ${channelFor(rows)})`
                    : preview.contract
                      ? ` · Contrato ${preview.contract}`
                      : ''}
                </span>
              </div>
              {rows.map((row, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {index === 0 && <span className="text-xs text-muted-foreground">Kilos</span>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.kilos}
                      onChange={(e) => updateRow(index, 'kilos', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    {index === 0 && (
                      <span className="text-xs text-muted-foreground">Volumen (cm³)</span>
                    )}
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={row.volumeCm3}
                      onChange={(e) => updateRow(index, 'volumeCm3', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar bulto"
                    disabled={rows.length <= 1}
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, { kilos: '', volumeCm3: '' }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Agregar bulto
              </Button>
            </div>

            {serviceType === 'home_delivery' && (
              <div className="space-y-2">
                <Label>Localidad</Label>
                {candidates.length > 0 ? (
                  <Select value={localidad} onValueChange={setLocalidad}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí la localidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={localidad}
                    onChange={(e) => setLocalidad(e.target.value)}
                    placeholder="Localidad"
                  />
                )}
              </div>
            )}

            {preview.warnings.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4 text-amber-900">
                    {preview.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {!preview.canCreate && preview.blockReason && (
              <Alert variant="destructive">
                <AlertDescription>{preview.blockReason}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : previewError ? (
          <Alert variant="destructive">
            <AlertDescription>{previewError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Procesando...' : 'Crear envío'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
