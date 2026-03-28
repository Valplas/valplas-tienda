import { z } from 'zod';

export const shippingZoneSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  description: z.string().optional(),
  postcodes: z
    .string()
    .min(1, 'Ingresá al menos un código postal')
    .refine((val) => {
      const codes = val.split(',').map((c) => c.trim());
      return codes.every((c) => /^\d{4}$/.test(c));
    }, 'Códigos postales deben ser de 4 dígitos, separados por comas'),
  isActive: z.boolean()
});

export const carrierSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  baseRate: z.number().min(0, 'Tarifa debe ser mayor o igual a 0'),
  estimatedDays: z.number().min(1, 'Días estimados deben ser al menos 1'),
  isActive: z.boolean()
});

export type ShippingZoneFormData = z.infer<typeof shippingZoneSchema>;
export type CarrierFormData = z.infer<typeof carrierSchema>;
