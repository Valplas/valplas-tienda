'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { carrierSchema, type CarrierFormData } from '@/lib/validations/shipping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import type { AdminCarrier } from '@/lib/services/shipping-admin.service';

interface CarrierFormProps {
  carrier?: AdminCarrier;
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
          code: carrier.code,
          logoUrl: carrier.logoUrl ?? '',
          isActive: carrier.isActive
        }
      : {
          name: '',
          code: '',
          logoUrl: '',
          isActive: true
        }
  });

  const isActive = useWatch({ control, name: 'isActive' });

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
          placeholder="Ej: Envío Estándar"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Code */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="code">
          Código <span className="text-red-500">*</span>
        </Label>
        <Input id="code" {...register('code')} placeholder="Ej: standard" disabled={isLoading} />
        {errors.code && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.code.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Identificador único: minúsculas, números, guiones (sin espacios)
        </p>
      </div>

      {/* Logo URL */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="logoUrl">Logo (URL)</Label>
        <Input
          id="logoUrl"
          {...register('logoUrl')}
          placeholder="https://..."
          disabled={isLoading}
        />
        {errors.logoUrl && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.logoUrl.message}</p>
        )}
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
          Carrier activo
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isLoading ? 'Guardando...' : carrier ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
