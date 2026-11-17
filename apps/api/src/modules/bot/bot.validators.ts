// apps/api/src/modules/bot/bot.validators.ts
//
// Requests en snake_case (convención del proyecto); las respuestas salen en camelCase por el
// middleware camelCaseResponse.

import { z } from 'zod';
import { createAddressSchema } from '../addresses/address.validators.js';

const CATALOG_SORTS = [
  'featured',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
  'newest'
] as const;

const page = z.coerce.number().int().min(1).optional().default(1);
const limit = z.coerce.number().int().min(1).max(50).optional().default(10);

/** Teléfono tal cual llega de WhatsApp (5491122334455) o en E.164 (+5491122334455). */
const phone = z.string().trim().min(8).max(20);

export const paginationQuerySchema = z.object({ page, limit });

export const catalogProductsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().optional(),
  sort: z.enum(CATALOG_SORTS).optional(),
  page,
  limit
});

export const productIdParamsSchema = z.object({ id: z.string().uuid() });

export const phoneParamsSchema = z.object({ phone });

export const findOrCreateCustomerSchema = z.object({
  phone,
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(255).optional()
});

export const customerIdParamsSchema = z.object({ id: z.string().uuid() });

// Misma validación que el alta de direcciones web; el alias es opcional desde WhatsApp.
export const createCustomerAddressSchema = createAddressSchema.extend({
  alias: z.string().min(2).max(50).optional().default('WhatsApp')
});

export const botOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  // Presentación elegida (tier de la lista). Obligatoria: sin ella el pedido se vendería a costo.
  price_list_id: z.string().uuid(),
  // Bultos de la presentación, no unidades sueltas
  quantity: z.number().int().min(1).max(10000)
});

const items = z.array(botOrderItemSchema).min(1).max(50);

export const quoteSchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    shipping_address_id: z.string().uuid().optional(),
    postcode: z
      .string()
      .regex(/^\d{4,8}$/)
      .optional(),
    items
  })
  .refine((data) => !data.shipping_address_id || data.customer_id, {
    message: 'shipping_address_id requiere customer_id',
    path: ['customer_id']
  });

export const createBotOrderSchema = z.object({
  customer_id: z.string().uuid(),
  shipping_address_id: z.string().uuid(),
  shipping_carrier_id: z.string().uuid(),
  items,
  notes: z.string().max(500).optional(),
  // Clave de idempotencia generada por el bot (ej: "<wa_id>:<id de carrito>"). Un reintento
  // con la misma clave devuelve la orden ya creada.
  idempotency_key: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_\-:.]+$/, 'Solo letras, números y _ - : .')
});

export const orderNumberParamsSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3,4}-\d{8}-\d{4,6}$/, 'Número de orden inválido')
});

export const orderCustomerQuerySchema = z.object({ customer_id: z.string().uuid() });

export const orderActionSchema = z.object({
  customer_id: z.string().uuid(),
  reason: z.string().trim().max(300).optional()
});

export type CatalogProductsQuery = z.output<typeof catalogProductsQuerySchema>;
export type PaginationQuery = z.output<typeof paginationQuerySchema>;
export type FindOrCreateCustomerInput = z.output<typeof findOrCreateCustomerSchema>;
export type CreateCustomerAddressInput = z.output<typeof createCustomerAddressSchema>;
export type QuoteInput = z.output<typeof quoteSchema>;
export type CreateBotOrderInput = z.output<typeof createBotOrderSchema>;
export type OrderActionInput = z.output<typeof orderActionSchema>;
