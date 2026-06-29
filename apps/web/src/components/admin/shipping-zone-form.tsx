'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shippingZoneSchema, type ShippingZoneFormData } from '@/lib/validations/shipping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import type { AdminZone } from '@/lib/services/shipping-admin.service';

interface ShippingZoneFormProps {
  zone?: AdminZone;
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
          provinces: zone.provinces.join(', '),
          excludedPostcodes: zone.excludedPostcodes.join(', '),
          isActive: zone.isActive
        }
      : {
          name: '',
          provinces: '',
          excludedPostcodes: '',
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
        <Input id="name" {...register('name')} placeholder="Ej: Nacional" disabled={isLoading} />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Provinces */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="provinces">
          Provincias <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="provinces"
          {...register('provinces')}
          placeholder="Ej: CABA, Buenos Aires, Córdoba"
          disabled={isLoading}
          rows={2}
        />
        {errors.provinces && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.provinces.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Provincias que cubre esta zona, separadas por comas
        </p>
      </div>

      {/* Excluded postcodes */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="excludedPostcodes">Códigos Postales Excluidos</Label>
        <Textarea
          id="excludedPostcodes"
          {...register('excludedPostcodes')}
          placeholder="Ej: 1602, 1603"
          disabled={isLoading}
          rows={2}
        />
        {errors.excludedPostcodes && (
          <p className="text-sm text-red-500 absolute bottom-0">
            {errors.excludedPostcodes.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          CP de 4 dígitos donde NO se entrega, separados por comas (opcional)
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
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isLoading ? 'Guardando...' : zone ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
