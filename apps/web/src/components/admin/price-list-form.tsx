'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { priceListSchema, type PriceListFormData } from '@/lib/validations/price-list';
import type { PriceList } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface PriceListFormProps {
  priceList?: PriceList;
  onSubmit: (data: PriceListFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PriceListForm({ priceList, onSubmit, onCancel, isLoading }: PriceListFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm<PriceListFormData>({
    resolver: zodResolver(priceListSchema),
    defaultValues: priceList
      ? {
          name: priceList.name,
          margin: priceList.margin,
          discount: priceList.discount,
          is_active: priceList.is_active
        }
      : { name: '', margin: 0, discount: 0, is_active: true }
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Nombre */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Lista Mayorista A"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Margen */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="margin">
          Margen (%) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="margin"
          type="number"
          step="0.01"
          min="0"
          {...register('margin', { valueAsNumber: true })}
          placeholder="50"
          disabled={isLoading}
        />
        {errors.margin && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.margin.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Precio final = Costo × (1 + Margen / 100)</p>
      </div>

      {/* Descuento (deshabilitado) */}
      <div className="space-y-2 relative pb-5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="discount" className="text-muted-foreground">
            Descuento (%)
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Reservado para uso futuro</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="discount"
          type="number"
          step="0.01"
          min="0"
          max="100"
          {...register('discount', { valueAsNumber: true })}
          placeholder="0"
          disabled={true}
          className="opacity-50 cursor-not-allowed"
        />
      </div>

      {/* Activa */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={watch('is_active')}
          onCheckedChange={(checked) => setValue('is_active', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Lista activa
        </Label>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : priceList ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
