import { z } from 'zod';

/**
 * Schema para crear marca
 */
export const createBrandSchema = z.object({
  name: z
    .string()
    .min(1, 'Nombre es requerido')
    .max(100, 'Nombre no puede exceder 100 caracteres'),

  slug: z
    .string()
    .min(1, 'Slug es requerido')
    .max(100, 'Slug no puede exceder 100 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Slug solo puede contener minúsculas, números y guiones'),

  description: z.string().max(1000, 'Descripción no puede exceder 1000 caracteres').optional(),

  logoUrl: z.string().url('Debe ser una URL válida').max(500).optional()
});

/**
 * Schema para actualizar marca
 */
export const updateBrandSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().max(1000).optional(),
    logoUrl: z.string().url().max(500).optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Tipos inferidos
 */
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
