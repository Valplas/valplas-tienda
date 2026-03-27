'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { carrierSchema, type CarrierFormData } from '@/lib/validations/shipping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Carrier } from '@/lib/mock/services/fake-shipping-admin.service';

interface CarrierFormProps {
  carrier?: Carrier;
  onSubmit: (data: CarrierFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CarrierForm({ carrier, onSubmit, onCancel, isLoading }: CarrierFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue
  } = useForm<CarrierFormData>({
    resolver: zodResolver(carrierSchema),
    defaultValues: carrier
      ? {
          name: carrier.name,
          base_rate: carrier.base_rate,
          estimated_days: carrier.estimated_days,
          is_active: carrier.is_active
        }
      : {
          name: '',
          base_rate: 0,
          estimated_days: 1,
          is_active: true
        }
  });

  const isActive = useWatch({ control, name: 'is_active' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre del Carrier <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Andreani Estándar"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Base Rate */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="base_rate">
          Tarifa Base (ARS) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="base_rate"
          type="number"
          step="0.01"
          {...register('base_rate', { valueAsNumber: true })}
          placeholder="0.00"
          disabled={isLoading}
        />
        {errors.base_rate && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.base_rate.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Tarifa base para esta opción de envío</p>
      </div>

      {/* Estimated Days */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="estimated_days">
          Días Estimados <span className="text-red-500">*</span>
        </Label>
        <Input
          id="estimated_days"
          type="number"
          min="1"
          {...register('estimated_days', { valueAsNumber: true })}
          placeholder="1"
          disabled={isLoading}
        />
        {errors.estimated_days && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.estimated_days.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Tiempo estimado de entrega</p>
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="is_active"
          checked={isActive}
          onCheckedChange={(checked) => setValue('is_active', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="is_active" className="cursor-pointer font-normal">
          Carrier activo
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : carrier ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
