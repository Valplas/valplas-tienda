/**
 * Common Validation Schemas
 * Reusable schemas and validators
 */

import { z } from 'zod';

/**
 * Email Schema
 */
export const emailSchema = z.string().email('Email inválido');

/**
 * Phone Schema (Argentina format E.164)
 */
export const phoneSchema = z.string().regex(/^\+54\d{10,11}$/, 'Formato: +5491122334455');

/**
 * Optional Phone Schema
 */
export const optionalPhoneSchema = z
  .string()
  .regex(/^\+54\d{10,11}$/, 'Formato: +5491122334455')
  .optional()
  .or(z.literal(''));

/**
 * Postcode Schema (Argentina - 4 digits)
 */
export const postcodeSchema = z
  .string()
  .length(4, 'Código postal de 4 dígitos')
  .regex(/^\d{4}$/, 'Solo números');

/**
 * Password Schema
 */
export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Debe contener una mayúscula')
  .regex(/[0-9]/, 'Debe contener un número');

/**
 * Username Schema
 */
export const usernameSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(30, 'Máximo 30 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo');

/**
 * Optional Username Schema
 */
export const optionalUsernameSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(30, 'Máximo 30 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo')
  .optional()
  .or(z.literal(''));

/**
 * Slug Schema
 */
export const slugSchema = z
  .string()
  .min(2, 'Mínimo 2 caracteres')
  .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones');

/**
 * URL Schema
 */
export const urlSchema = z.string().url('URL inválida');

/**
 * Optional URL Schema
 */
export const optionalUrlSchema = z.string().url('URL inválida').optional().or(z.literal(''));

/**
 * Positive Number Schema
 */
export const positiveNumberSchema = z.number().min(0, 'Debe ser mayor o igual a 0');

/**
 * Price Schema
 */
export const priceSchema = z.number().min(0, 'Precio debe ser mayor o igual a 0');

/**
 * Quantity Schema
 */
export const quantitySchema = z.number().min(1, 'Cantidad debe ser mayor a 0');

/**
 * Pagination Schema
 */
export const paginationSchema = z.object({
  page: z.number().min(1, 'Página debe ser mayor a 0').optional(),
  limit: z.number().min(1, 'Límite debe ser mayor a 0').max(100, 'Máximo 100').optional(),
  cursor: z.string().optional()
});

export type PaginationFormData = z.infer<typeof paginationSchema>;

/**
 * Date Range Schema
 */
export const dateRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional()
});

export type DateRangeFormData = z.infer<typeof dateRangeSchema>;

/**
 * Search Schema
 */
export const searchSchema = z.object({
  q: z.string().min(1, 'Ingresá un término de búsqueda').max(100, 'Máximo 100 caracteres')
});

export type SearchFormData = z.infer<typeof searchSchema>;

/**
 * ID Schema
 */
export const idSchema = z.string().min(1, 'ID requerido');

/**
 * UUID Schema (for strict validation)
 */
export const uuidSchema = z.string().uuid('UUID inválido');

/**
 * File Upload Schema
 */
export const fileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 5 * 1024 * 1024, 'Máximo 5MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      'Solo JPG, PNG o WebP'
    )
});

export type FileUploadFormData = z.infer<typeof fileUploadSchema>;

/**
 * Image Upload Schema (Multiple)
 */
export const imageUploadSchema = z.object({
  images: z
    .array(z.instanceof(File))
    .max(5, 'Máximo 5 imágenes')
    .refine((files) => files.every((f) => f.size <= 5 * 1024 * 1024), 'Cada imagen: máximo 5MB')
    .refine(
      (files) => files.every((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)),
      'Solo JPG, PNG o WebP'
    )
});

export type ImageUploadFormData = z.infer<typeof imageUploadSchema>;

/**
 * Boolean String Schema (for query params)
 * Converts "true"/"false" strings to boolean
 */
export const booleanStringSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());

/**
 * Number String Schema (for query params)
 * Converts string to number
 */
export const numberStringSchema = z.string().transform((val) => {
  const num = Number(val);
  if (isNaN(num)) throw new Error('Número inválido');
  return num;
});
