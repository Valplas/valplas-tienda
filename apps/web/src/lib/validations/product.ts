/**
 * Product Validation Schemas
 */

import { z } from 'zod';

/**
 * Product Schema (for admin CRUD)
 */
export const productSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres'),
  sku: z.string().min(1, 'SKU requerido'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
  base_price: z.number().min(0, 'Precio debe ser mayor a 0'),
  stock: z.number().min(0, 'Stock no puede ser negativo'),
  category_id: z.string().min(1, 'Seleccioná una categoría'),
  brand_id: z.string().min(1, 'Seleccioná una marca'),
  unit: z.string().optional(),
  is_featured: z.boolean(),
  is_active: z.boolean()
});

export type ProductFormData = z.infer<typeof productSchema>;

/**
 * Product Filter Schema
 */
export const productFilterSchema = z.object({
  search: z.string().optional(),
  category_id: z.string().optional(),
  brand_id: z.string().optional(),
  min_price: z.number().min(0, 'Precio mínimo inválido').optional(),
  max_price: z.number().min(0, 'Precio máximo inválido').optional(),
  is_featured: z.boolean().optional(),
  is_active: z.boolean().optional()
});

export type ProductFilterFormData = z.infer<typeof productFilterSchema>;

/**
 * Add to Cart Schema
 */
export const addToCartSchema = z.object({
  product_id: z.string().min(1, 'Producto requerido'),
  quantity: z.number().min(1, 'Cantidad debe ser mayor a 0').default(1)
});

export type AddToCartFormData = z.infer<typeof addToCartSchema>;

/**
 * Update Cart Item Schema
 */
export const updateCartItemSchema = z.object({
  product_id: z.string().min(1, 'Producto requerido'),
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
  parent_id: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  display_order: z.number().min(0, 'Orden debe ser mayor o igual a 0').default(0)
});

export type CategoryFormData = z.infer<typeof categorySchema>;

/**
 * Brand Schema
 */
export const brandSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().min(2, 'Slug requerido'),
  is_active: z.boolean().default(true)
});

export type BrandFormData = z.infer<typeof brandSchema>;
