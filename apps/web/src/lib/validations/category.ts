import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z
    .string()
    .min(1, 'Slug requerido')
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  parentId: z.string().nullable(),
  displayOrder: z.number().min(0),
  description: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
  imageUrl: z.string().url('URL inválida').optional().or(z.literal(''))
});

export type CategoryFormData = z.infer<typeof categorySchema>;
