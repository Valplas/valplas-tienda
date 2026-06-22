// apps/api/src/modules/orders/order.validators.ts

import { z } from 'zod';

const ORDER_STATUSES = [
  'pending_payment',
  'payment_confirmed',
  'processing',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'failed'
] as const;

const PAYMENT_METHODS = ['mercadopago', 'cash', 'bank_transfer'] as const;

export const createOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1)
});

export const createOrderSchema = z.object({
  shipping_address_id: z.string().uuid(),
  shipping_carrier_id: z.string().uuid(),
  payment_method: z.enum(PAYMENT_METHODS),
  notes: z.string().max(500).optional(),
  items: z.array(createOrderItemSchema).min(1),
  payer_identification: z
    .object({
      type: z.enum(['DNI', 'CUIT', 'CUIL', 'CI', 'LC', 'LE', 'Otro']),
      number: z.string().min(7).max(20)
    })
    .optional()
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().max(500).optional(),
  payment_id: z.string().optional()
});

export const listOrdersSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  order_number: z.string().optional()
});

export const createAdminOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  price_list_id: z.string().uuid()
});

export const updateAdminOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(0),
  price_list_id: z.string().uuid()
});

export const createAdminOrderSchema = z.object({
  user_id: z.string().uuid(),
  shipping_address_id: z.string().uuid().nullable().optional(),
  items: z.array(createAdminOrderItemSchema).min(1),
  notes: z.string().max(1000).optional(),
  payment_method: z.string().max(50).optional()
});

export const adminListOrdersSchema = listOrdersSchema
  .extend({
    user_id: z.string().uuid().optional(),
    search: z.string().optional()
  })
  .extend({
    limit: z.coerce.number().int().min(1).max(500).optional().default(20)
  });

export const updateAdminOrderSchema = z.object({
  shipping_address_id: z.string().uuid(),
  items: z.array(updateAdminOrderItemSchema).min(1)
});
