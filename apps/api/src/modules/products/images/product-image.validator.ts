import { z } from 'zod';

export const tempIdParamSchema = z.object({
  tempId: z.string().uuid('tempId debe ser un UUID válido')
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('id de producto debe ser un UUID válido')
});

export const productImageParamsSchema = z.object({
  id: z.string().uuid('id de producto debe ser un UUID válido'),
  imageId: z.string().uuid('imageId debe ser un UUID válido')
});

export const uploadImageBodySchema = z.object({
  altText: z.string().max(255, 'altText no puede exceder 255 caracteres').optional()
});

export const reorderImagesSchema = z.object({
  imageIds: z
    .array(z.string().uuid('Cada imageId debe ser un UUID válido'))
    .min(1, 'Debe incluir al menos una imagen')
});

export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
