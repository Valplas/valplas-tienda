import { z } from 'zod';

// Zona: provincias y CP excluidos se ingresan como texto separado por comas
// (el form los parsea a array al enviar al backend).
export const shippingZoneSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  provinces: z.string().min(2, 'Ingresá al menos una provincia'),
  excludedPostcodes: z
    .string()
    .optional()
    .refine(
      (val) =>
        !val ||
        val
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
          .every((c) => /^\d{4}$/.test(c)),
      'Códigos postales deben ser de 4 dígitos, separados por comas'
    ),
  isActive: z.boolean()
});

export const carrierSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  code: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .regex(/^[a-z0-9_-]+$/, 'Solo minúsculas, números, guiones y guiones bajos'),
  logoUrl: z.union([z.string().url('URL inválida'), z.literal('')]).optional(),
  isActive: z.boolean()
});

export const rateSchema = z
  .object({
    zoneId: z.string().uuid('Seleccioná una zona'),
    carrierId: z.string().uuid('Seleccioná un carrier'),
    minAmount: z.number({ message: 'Requerido' }).min(0, 'Debe ser ≥ 0'),
    // maxAmount = monto a partir del cual el envío es gratis (opcional)
    maxAmount: z
      .number()
      .min(0, 'Debe ser ≥ 0')
      .optional()
      .or(z.nan().transform(() => undefined)),
    price: z.number({ message: 'Requerido' }).min(0, 'Debe ser ≥ 0'),
    estimatedDaysMin: z.number().int().min(1, 'Mínimo 1 día'),
    estimatedDaysMax: z.number().int().min(1, 'Mínimo 1 día'),
    isActive: z.boolean()
  })
  .refine((d) => d.maxAmount == null || d.maxAmount > d.minAmount, {
    message: 'El monto de envío gratis debe ser mayor al mínimo',
    path: ['maxAmount']
  })
  .refine((d) => d.estimatedDaysMax >= d.estimatedDaysMin, {
    message: 'Días máx debe ser ≥ días mín',
    path: ['estimatedDaysMax']
  });

export type ShippingZoneFormData = z.infer<typeof shippingZoneSchema>;
export type CarrierFormData = z.infer<typeof carrierSchema>;
export type RateFormData = z.infer<typeof rateSchema>;
