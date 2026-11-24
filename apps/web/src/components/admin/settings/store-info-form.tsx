'use client';

import { useState, type KeyboardEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError } from '@/lib/api';
import { updateStoreInfo } from '@/lib/services/settings.service';
import type { StoreDeliveryDay, StoreInfo, StoreInfoPayload, StorePaymentMethod } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/ui/loading-button';

const DAY_OPTIONS: { value: StoreDeliveryDay; label: string }[] = [
  { value: 'monday', label: 'Lunes' },
  { value: 'tuesday', label: 'Martes' },
  { value: 'wednesday', label: 'Miércoles' },
  { value: 'thursday', label: 'Jueves' },
  { value: 'friday', label: 'Viernes' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' }
];

const PAYMENT_OPTIONS: { value: StorePaymentMethod; label: string }[] = [
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash_on_delivery', label: 'Efectivo contra entrega' },
  { value: 'cash_pickup', label: 'Efectivo al retirar' }
];

const MAX_ZONES = 50;
const MAX_ZONE_LENGTH = 100;
const MAX_AMOUNT = 9_999_999_999.99;

// Mismos límites que apps/api/src/modules/settings/store-info.validator.ts.
// Los campos de texto/monto se editan como string y se convierten al enviar.
const amountField = z
  .string()
  .trim()
  .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Monto inválido')
  .refine((v) => v === '' || Number(v) <= MAX_AMOUNT, 'Monto demasiado grande');

const storeInfoFormSchema = z.object({
  businessHours: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  deliveryDays: z.array(z.enum(DAY_OPTIONS.map((d) => d.value) as [StoreDeliveryDay])),
  deliveryZones: z
    .array(z.string().trim().min(1).max(MAX_ZONE_LENGTH))
    .max(MAX_ZONES, `Máximo ${MAX_ZONES} zonas`),
  minimumOrder: amountField,
  freeShippingFrom: amountField,
  paymentMethods: z.array(z.enum(PAYMENT_OPTIONS.map((p) => p.value) as [StorePaymentMethod])),
  transferAlias: z.string().trim().max(40, 'Máximo 40 caracteres'),
  transferCbu: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{22}$/.test(v), 'El CBU debe tener 22 dígitos'),
  transferHolder: z.string().trim().max(100, 'Máximo 100 caracteres'),
  transferBank: z.string().trim().max(60, 'Máximo 60 caracteres'),
  pickupAddress: z.string().trim().max(500, 'Máximo 500 caracteres'),
  priceListUrl: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .refine((v) => v === '' || z.url().safeParse(v).success, 'URL inválida')
    .refine((v) => v === '' || v.startsWith('https://'), 'Debe ser una URL https'),
  contactPhone: z.string().trim().max(30, 'Máximo 30 caracteres'),
  contactEmail: z
    .string()
    .trim()
    .max(255, 'Máximo 255 caracteres')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Email inválido'),
  additionalInfo: z.string().trim().max(5000, 'Máximo 5000 caracteres')
});

type StoreInfoFormData = z.infer<typeof storeInfoFormSchema>;

const emptyToNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const amountToNumber = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const listToNull = <T,>(list: T[]): T[] | null => (list.length > 0 ? list : null);

function toFormValues(info: StoreInfo): StoreInfoFormData {
  return {
    businessHours: info.businessHours ?? '',
    deliveryDays: info.deliveryDays ?? [],
    deliveryZones: info.deliveryZones ?? [],
    minimumOrder: info.minimumOrder != null ? String(info.minimumOrder) : '',
    freeShippingFrom: info.freeShippingFrom != null ? String(info.freeShippingFrom) : '',
    paymentMethods: info.paymentMethods ?? [],
    transferAlias: info.transferDetails?.alias ?? '',
    transferCbu: info.transferDetails?.cbu ?? '',
    transferHolder: info.transferDetails?.holder ?? '',
    transferBank: info.transferDetails?.bank ?? '',
    pickupAddress: info.pickupAddress ?? '',
    priceListUrl: info.priceListUrl ?? '',
    contactPhone: info.contactPhone ?? '',
    contactEmail: info.contactEmail ?? '',
    additionalInfo: info.additionalInfo ?? ''
  };
}

function toPayload(values: StoreInfoFormData): StoreInfoPayload {
  return {
    business_hours: emptyToNull(values.businessHours),
    delivery_days: listToNull(values.deliveryDays),
    delivery_zones: listToNull(values.deliveryZones),
    minimum_order: amountToNumber(values.minimumOrder),
    free_shipping_from: amountToNumber(values.freeShippingFrom),
    payment_methods: listToNull(values.paymentMethods),
    transfer_alias: emptyToNull(values.transferAlias),
    transfer_cbu: emptyToNull(values.transferCbu),
    transfer_holder: emptyToNull(values.transferHolder),
    transfer_bank: emptyToNull(values.transferBank),
    pickup_address: emptyToNull(values.pickupAddress),
    price_list_url: emptyToNull(values.priceListUrl),
    contact_phone: emptyToNull(values.contactPhone),
    contact_email: emptyToNull(values.contactEmail),
    additional_info: emptyToNull(values.additionalInfo)
  };
}

function saveErrorDescription(error: unknown): string {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    const messages = error.details
      .map((d) => (d && typeof d === 'object' && 'message' in d ? String(d.message) : ''))
      .filter(Boolean);
    if (messages.length > 0) return messages.join('. ');
  }
  return error instanceof Error ? error.message : 'Intenta nuevamente';
}

interface StoreInfoFormProps {
  storeInfo: StoreInfo;
  onChange?: (storeInfo: StoreInfo) => void;
}

export function StoreInfoForm({ storeInfo, onChange }: StoreInfoFormProps) {
  const [saving, setSaving] = useState(false);
  const [zoneDraft, setZoneDraft] = useState('');

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm<StoreInfoFormData>({
    resolver: zodResolver(storeInfoFormSchema),
    defaultValues: toFormValues(storeInfo)
  });

  const onSubmit = async (values: StoreInfoFormData) => {
    setSaving(true);
    try {
      const saved = await updateStoreInfo(toPayload(values));
      reset(toFormValues(saved));
      onChange?.(saved);
      toast.success('Información del negocio guardada');
    } catch (error) {
      toast.error('No se pudo guardar la información', {
        description: saveErrorDescription(error)
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <FormField
        as="textarea"
        label="Horario de atención"
        rows={3}
        placeholder="Lunes a viernes de 9 a 18 hs"
        error={errors.businessHours?.message}
        {...register('businessHours')}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Días de entrega</legend>
        <Controller
          control={control}
          name="deliveryDays"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DAY_OPTIONS.map((day) => (
                <div key={day.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={field.value.includes(day.value)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...field.value, day.value]
                          : field.value.filter((d) => d !== day.value)
                      )
                    }
                  />
                  <Label htmlFor={`day-${day.value}`} className="font-normal">
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>
          )}
        />
      </fieldset>

      <Controller
        control={control}
        name="deliveryZones"
        render={({ field }) => {
          const addZone = () => {
            const zone = zoneDraft.trim().slice(0, MAX_ZONE_LENGTH);
            if (!zone) return;
            if (field.value.some((z) => z.toLowerCase() === zone.toLowerCase())) {
              setZoneDraft('');
              return;
            }
            if (field.value.length >= MAX_ZONES) {
              toast.error(`Máximo ${MAX_ZONES} zonas`);
              return;
            }
            field.onChange([...field.value, zone]);
            setZoneDraft('');
          };
          const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addZone();
            }
          };
          return (
            <div className="space-y-2">
              <Label htmlFor="zone-draft">Zonas de entrega</Label>
              <div className="flex gap-2">
                <Input
                  id="zone-draft"
                  value={zoneDraft}
                  maxLength={MAX_ZONE_LENGTH}
                  placeholder="Ej: CABA, Zona Norte"
                  onChange={(e) => setZoneDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <Button type="button" variant="outline" onClick={addZone}>
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </div>
              {field.value.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {field.value.map((zone) => (
                    <li
                      key={zone}
                      className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
                    >
                      {zone}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-background"
                        aria-label={`Quitar zona ${zone}`}
                        onClick={() => field.onChange(field.value.filter((z) => z !== zone))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField
          label="Pedido mínimo ($)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          error={errors.minimumOrder?.message}
          {...register('minimumOrder')}
        />
        <FormField
          label="Envío gratis desde ($)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          error={errors.freeShippingFrom?.message}
          {...register('freeShippingFrom')}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Medios de pago</legend>
        <Controller
          control={control}
          name="paymentMethods"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((method) => (
                <div key={method.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`pay-${method.value}`}
                    checked={field.value.includes(method.value)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...field.value, method.value]
                          : field.value.filter((m) => m !== method.value)
                      )
                    }
                  />
                  <Label htmlFor={`pay-${method.value}`} className="font-normal">
                    {method.label}
                  </Label>
                </div>
              ))}
            </div>
          )}
        />
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Datos de transferencia</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField
            label="Alias"
            error={errors.transferAlias?.message}
            {...register('transferAlias')}
          />
          <FormField
            label="CBU"
            inputMode="numeric"
            maxLength={22}
            helperText="22 dígitos"
            error={errors.transferCbu?.message}
            {...register('transferCbu')}
          />
          <FormField
            label="Titular"
            error={errors.transferHolder?.message}
            {...register('transferHolder')}
          />
          <FormField
            label="Banco"
            error={errors.transferBank?.message}
            {...register('transferBank')}
          />
        </div>
      </fieldset>

      <FormField
        label="Dirección de retiro"
        error={errors.pickupAddress?.message}
        {...register('pickupAddress')}
      />
      <FormField
        label="URL de la lista de precios"
        type="url"
        placeholder="https://..."
        error={errors.priceListUrl?.message}
        {...register('priceListUrl')}
      />

      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField
          label="Teléfono de contacto"
          type="tel"
          error={errors.contactPhone?.message}
          {...register('contactPhone')}
        />
        <FormField
          label="Email de contacto"
          type="email"
          error={errors.contactEmail?.message}
          {...register('contactEmail')}
        />
      </div>

      <FormField
        as="textarea"
        label="Información adicional"
        rows={4}
        error={errors.additionalInfo?.message}
        {...register('additionalInfo')}
      />

      <LoadingButton type="submit" loading={saving} loadingText="Guardando...">
        Guardar
      </LoadingButton>
    </form>
  );
}
