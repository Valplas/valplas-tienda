import { z } from 'zod';

export const priceListSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
  margin: z
    .number({ error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(10000, 'Máximo 10000%'),
  discount: z
    .number({ error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(100, 'Máximo 100%'),
  is_active: z.boolean()
});

export type PriceListFormData = z.infer<typeof priceListSchema>;
