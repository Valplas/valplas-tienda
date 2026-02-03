import { z } from 'zod';

/**
 * Schema para agregar producto al carrito
 */
export const addToCartSchema = z.object({
  productId: z.string().uuid('Product ID debe ser UUID válido'),
  quantity: z
    .number()
    .int('Cantidad debe ser un número entero')
    .min(1, 'Cantidad debe ser al menos 1')
    .max(999, 'Cantidad no puede exceder 999')
});

/**
 * Schema para actualizar cantidad de producto en carrito
 */
export const updateCartItemSchema = z.object({
  quantity: z
    .number()
    .int('Cantidad debe ser un número entero')
    .min(1, 'Cantidad debe ser al menos 1')
    .max(999, 'Cantidad no puede exceder 999')
});

/**
 * Tipos inferidos
 */
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
