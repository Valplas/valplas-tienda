import { z } from 'zod';

const quantitySchema = z
  .number()
  .int('Cantidad debe ser un número entero')
  .min(1, 'Cantidad debe ser al menos 1')
  .max(999, 'Cantidad no puede exceder 999');

// Presentación (tier) de la línea: lista de precios. Sin ella, la línea es "por unidad a costo".
const priceListIdSchema = z.string().uuid('Price list ID debe ser UUID válido').optional();

/**
 * Schema para agregar producto al carrito
 */
export const addToCartSchema = z.object({
  productId: z.string().uuid('Product ID debe ser UUID válido'),
  quantity: quantitySchema,
  priceListId: priceListIdSchema
});

/**
 * Schema para actualizar cantidad de una línea (producto + presentación) del carrito
 */
export const updateCartItemSchema = z.object({
  quantity: quantitySchema,
  priceListId: priceListIdSchema
});

/**
 * Query para eliminar una línea (producto + presentación) del carrito
 */
export const removeCartItemQuerySchema = z.object({
  priceListId: priceListIdSchema
});

/**
 * Tipos inferidos
 */
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
