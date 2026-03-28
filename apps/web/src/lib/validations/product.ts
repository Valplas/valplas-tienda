/**
 * Product Validation Schemas
 */

import { z } from 'zod';

/**
 * Product Schema (for admin CRUD)
 */
export const productSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  sku: z
    .string()
    .regex(/^[a-zA-Z0-9-]*$/, 'SKU solo puede contener letras, números y guiones')
    .optional(),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
  basePrice: z
    .number({ message: 'Precio de costo requerido' })
    .min(0, 'Debe ser mayor o igual a 0'),
  stock: z.number({ message: 'Cantidad requerida' }).min(0, 'No puede ser negativo'),
  categoryId: z.string().min(1, 'Seleccioná una categoría'),
  brandId: z.string().optional(),
  unit: z.string().optional(),
  weight: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  length: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  origin: z.string().max(100).optional(),
  isFeatured: z.boolean(),
  isActive: z.boolean()
});

export type ProductFormData = z.infer<typeof productSchema>;

/**
 * Product Filter Schema
 */
export const productFilterSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  minPrice: z.number().min(0, 'Precio mínimo inválido').optional(),
  maxPrice: z.number().min(0, 'Precio máximo inválido').optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export type ProductFilterFormData = z.infer<typeof productFilterSchema>;

/**
 * Add to Cart Schema
 */
export const addToCartSchema = z.object({
  productId: z.string().min(1, 'Producto requerido'),
  quantity: z.number().min(1, 'Cantidad debe ser mayor a 0').default(1)
});

export type AddToCartFormData = z.infer<typeof addToCartSchema>;

/**
 * Update Cart Item Schema
 */
export const updateCartItemSchema = z.object({
  productId: z.string().min(1, 'Producto requerido'),
  quantity: z.number().min(0, 'Cantidad no puede ser negativa')
});

export type UpdateCartItemFormData = z.infer<typeof updateCartItemSchema>;

/**
 * Category Schema
 */
export const categorySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().min(2, 'Slug requerido'),
  description: z.string().optional(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().min(0, 'Orden debe ser mayor o igual a 0').default(0)
});

export type CategoryFormData = z.infer<typeof categorySchema>;

/**
 * Brand Schema
 */
export const brandSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().min(2, 'Slug requerido'),
  isActive: z.boolean().default(true)
});

export type BrandFormData = z.infer<typeof brandSchema>;
