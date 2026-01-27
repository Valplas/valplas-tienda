import { z } from 'zod';

export const brandSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z
    .string()
    .min(1, 'Slug requerido')
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  logo_url: z.string().url('URL inválida').optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  is_active: z.boolean()
});

export type BrandFormData = z.infer<typeof brandSchema>;
