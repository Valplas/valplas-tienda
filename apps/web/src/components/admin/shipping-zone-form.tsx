'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shippingZoneSchema, type ShippingZoneFormData } from '@/lib/validations/shipping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { ShippingZone } from '@/types';

interface ShippingZoneFormProps {
  zone?: ShippingZone;
  onSubmit: (data: ShippingZoneFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ShippingZoneForm({ zone, onSubmit, onCancel, isLoading }: ShippingZoneFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue
  } = useForm<ShippingZoneFormData>({
    resolver: zodResolver(shippingZoneSchema),
    defaultValues: zone
      ? {
          name: zone.name,
          description: '',
          postcodes: zone.postcodes.join(', '),
          isActive: zone.isActive
        }
      : {
          name: '',
          description: '',
          postcodes: '',
          isActive: true
        }
  });

  const isActive = useWatch({ control, name: 'isActive' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre de la Zona <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Zona Norte GBA"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Descripción opcional de la zona"
          disabled={isLoading}
          rows={2}
        />
        {errors.description && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.description.message}</p>
        )}
      </div>

      {/* Postcodes */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="postcodes">
          Códigos Postales <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="postcodes"
          {...register('postcodes')}
          placeholder="Ej: 1602, 1603, 1605"
          disabled={isLoading}
          rows={3}
        />
        {errors.postcodes && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.postcodes.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Ingresá códigos postales de 4 dígitos, separados por comas
        </p>
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
          Zona activa
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : zone ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
