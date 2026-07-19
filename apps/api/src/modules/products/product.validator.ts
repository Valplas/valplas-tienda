import { z } from 'zod';

/**
 * Schema para filtros de búsqueda de productos
 */
export const productFiltersSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(24),
  sort: z
    .enum([
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
      'newest',
      'oldest',
      'stock_asc',
      'stock_desc',
      'updated_asc',
      'updated_desc'
    ])
    .optional()
    .default('newest')
});

/**
 * Schema para crear producto
 */
export const createProductSchema = z.object({
  sku: z
    .string()
    .min(1, 'SKU es requerido')
    .max(50, 'SKU no puede exceder 50 caracteres')
    .regex(/^[A-Z0-9-]+$/, 'SKU solo puede contener mayúsculas, números y guiones'),

  name: z.string().min(1, 'Nombre es requerido').max(255, 'Nombre no puede exceder 255 caracteres'),

  slug: z
    .string()
    .min(1, 'Slug es requerido')
    .max(255, 'Slug no puede exceder 255 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Slug solo puede contener minúsculas, números y guiones'),

  description: z.string().max(5000, 'Descripción no puede exceder 5000 caracteres').optional(),

  categoryId: z.string().uuid('Category ID debe ser UUID válido'),

  brandId: z.string().uuid('Brand ID debe ser UUID válido').optional(),

  basePrice: z.number().min(0, 'Precio debe ser mayor o igual a 0'),

  costPrice: z.number().min(0, 'Precio de costo debe ser mayor o igual a 0').optional().default(0),

  stock: z.number().int().min(0, 'Stock debe ser mayor o igual a 0').optional().default(0),

  weight: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  length: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  origin: z.string().max(100).optional(),

  isFeatured: z.boolean().optional().default(false)
});

/**
 * Schema para actualizar producto
 */
export const updateProductSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    slug: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().max(5000).optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
    basePrice: z.number().min(0).optional(),
    costPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    weight: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    length: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    origin: z.string().max(100).optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

/**
 * Tipos inferidos
 */
export type ProductFiltersInput = z.infer<typeof productFiltersSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
