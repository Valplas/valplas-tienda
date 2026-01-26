import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z
    .string()
    .min(1, 'Slug requerido')
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  parent_id: z.string().nullable(),
  display_order: z.number().min(0),
  description: z.string().optional().or(z.literal('')),
  is_active: z.boolean(),
  image_url: z.string().url('URL inválida').optional().or(z.literal(''))
});

export type CategoryFormData = z.infer<typeof categorySchema>;
