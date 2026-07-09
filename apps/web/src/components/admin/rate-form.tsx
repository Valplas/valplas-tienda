'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { rateSchema, type RateFormData } from '@/lib/validations/shipping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { AdminRate, AdminZone, AdminCarrier } from '@/lib/services/shipping-admin.service';

interface RateFormProps {
  rate?: AdminRate;
  zones: AdminZone[];
  carriers: AdminCarrier[];
  onSubmit: (data: RateFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function RateForm({ rate, zones, carriers, onSubmit, onCancel, isLoading }: RateFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue
  } = useForm<RateFormData>({
    resolver: zodResolver(rateSchema),
    defaultValues: rate
      ? {
          zoneId: rate.zoneId,
          carrierId: rate.carrierId,
          minAmount: rate.minAmount,
          maxAmount: rate.maxAmount ?? undefined,
          price: rate.price,
          estimatedDaysMin: rate.estimatedDaysMin,
          estimatedDaysMax: rate.estimatedDaysMax,
          isActive: rate.isActive
        }
      : {
          zoneId: '',
          carrierId: '',
          minAmount: 0,
          maxAmount: undefined,
          price: 0,
          estimatedDaysMin: 1,
          estimatedDaysMax: 3,
          isActive: true
        }
  });

  const zoneId = useWatch({ control, name: 'zoneId' });
  const carrierId = useWatch({ control, name: 'carrierId' });
  const isActive = useWatch({ control, name: 'isActive' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Zone */}
      <div className="space-y-2 relative pb-5">
        <Label>
          Zona <span className="text-red-500">*</span>
        </Label>
        <Select
          value={zoneId || undefined}
          onValueChange={(v) => setValue('zoneId', v, { shouldValidate: true })}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccioná una zona" />
          </SelectTrigger>
          <SelectContent>
            {zones.map((z) => (
              <SelectItem key={z.id} value={z.id}>
                {z.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.zoneId && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.zoneId.message}</p>
        )}
      </div>

      {/* Carrier */}
      <div className="space-y-2 relative pb-5">
        <Label>
          Carrier <span className="text-red-500">*</span>
        </Label>
        <Select
          value={carrierId || undefined}
          onValueChange={(v) => setValue('carrierId', v, { shouldValidate: true })}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccioná un carrier" />
          </SelectTrigger>
          <SelectContent>
            {carriers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.carrierId && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.carrierId.message}</p>
        )}
      </div>

      {/* Min amount */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="minAmount">
          Monto mínimo del carrito <span className="text-red-500">*</span>
        </Label>
        <Input
          id="minAmount"
          type="number"
          step="0.01"
          {...register('minAmount', { valueAsNumber: true })}
          disabled={isLoading}
        />
        {errors.minAmount && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.minAmount.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Esta tarifa aplica desde este monto hacia arriba
        </p>
      </div>

      {/* Max amount = free shipping threshold */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="maxAmount">Envío gratis a partir de</Label>
        <Input
          id="maxAmount"
          type="number"
          step="0.01"
          {...register('maxAmount', { valueAsNumber: true })}
          placeholder="Opcional"
          disabled={isLoading}
        />
        {errors.maxAmount && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.maxAmount.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Si el carrito alcanza este monto, el envío es gratis. Dejar vacío = nunca gratis.
        </p>
      </div>

      {/* Price */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="price">
          Precio del envío <span className="text-red-500">*</span>
        </Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          {...register('price', { valueAsNumber: true })}
          disabled={isLoading}
        />
        {errors.price && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.price.message}</p>
        )}
      </div>

      {/* Estimated days */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 relative pb-5">
          <Label htmlFor="estimatedDaysMin">
            Días mín <span className="text-red-500">*</span>
          </Label>
          <Input
            id="estimatedDaysMin"
            type="number"
            min="1"
            {...register('estimatedDaysMin', { valueAsNumber: true })}
            disabled={isLoading}
          />
          {errors.estimatedDaysMin && (
            <p className="text-sm text-red-500 absolute bottom-0">
              {errors.estimatedDaysMin.message}
            </p>
          )}
        </div>
        <div className="space-y-2 relative pb-5">
          <Label htmlFor="estimatedDaysMax">
            Días máx <span className="text-red-500">*</span>
          </Label>
          <Input
            id="estimatedDaysMax"
            type="number"
            min="1"
            {...register('estimatedDaysMax', { valueAsNumber: true })}
            disabled={isLoading}
          />
          {errors.estimatedDaysMax && (
            <p className="text-sm text-red-500 absolute bottom-0">
              {errors.estimatedDaysMax.message}
            </p>
          )}
        </div>
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="isActive"
          checked={isActive}
          onCheckedChange={(checked) => setValue('isActive', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="isActive" className="cursor-pointer font-normal">
          Tarifa activa
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isLoading ? 'Guardando...' : rate ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
