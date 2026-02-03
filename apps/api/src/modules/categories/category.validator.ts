import { z } from 'zod';

/**
 * Schema para crear categoría
 */
export const createCategorySchema = z.object({
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

  imageUrl: z.string().url('Debe ser una URL válida').max(500).optional(),

  parentId: z.string().uuid('Parent ID debe ser UUID válido').optional(),

  displayOrder: z.number().int().min(0).optional().default(0)
});

/**
 * Schema para actualizar categoría
 */
export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().max(1000).optional(),
    imageUrl: z.string().url().max(500).optional(),
    parentId: z.string().uuid().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Schema para reordenar categorías
 */
export const reorderCategoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string().uuid(),
        displayOrder: z.number().int().min(0)
      })
    )
    .min(1, 'Debe proporcionar al menos una categoría para reordenar')
});

/**
 * Tipos inferidos
 */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
