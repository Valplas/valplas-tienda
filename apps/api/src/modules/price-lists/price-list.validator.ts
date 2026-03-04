import { z } from 'zod';

export const createPriceListSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100, 'Nombre no puede exceder 100 caracteres'),
  margin: z
    .number({ error: 'Margen debe ser un número' })
    .min(0, 'Margen no puede ser negativo')
    .max(10000, 'Margen no puede exceder 10000%'),
  discount: z
    .number({ error: 'Descuento debe ser un número' })
    .min(0, 'Descuento no puede ser negativo')
    .max(100, 'Descuento no puede exceder 100%')
    .default(0),
  isActive: z.boolean().default(true)
});

export const updatePriceListSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    margin: z.number().min(0).max(10000).optional(),
    discount: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>;
