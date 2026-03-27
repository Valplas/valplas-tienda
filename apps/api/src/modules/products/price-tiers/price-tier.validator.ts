import { z } from 'zod';

const tierInputSchema = z.object({
  priceListId: z.string().uuid('priceListId debe ser un UUID válido'),
  minQuantity: z
    .number({ error: 'minQuantity debe ser un número' })
    .int('minQuantity debe ser un entero')
    .min(1, 'minQuantity debe ser mayor o igual a 1')
});

const filterSchema = z
  .object({
    all: z.boolean().optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional()
  })
  .refine((f) => f.all === true || f.categoryId !== undefined || f.brandId !== undefined, {
    message: 'Debe especificar un filtro: all, categoryId o brandId'
  });

export const replaceProductTiersSchema = z.object({
  tiers: z.array(tierInputSchema).min(1, 'Debe especificar al menos un tier')
});

export const bulkPreviewSchema = z.object({
  tiers: z.array(tierInputSchema).min(1, 'Debe especificar al menos un tier'),
  filter: filterSchema
});

export const bulkConfirmSchema = z.object({
  tiers: z.array(tierInputSchema).min(1, 'Debe especificar al menos un tier'),
  filter: filterSchema,
  conflictResolution: z.enum(['skip', 'overwrite'])
});
