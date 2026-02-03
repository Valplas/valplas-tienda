// apps/api/src/modules/shipping/shipping.validators.ts

import { z } from 'zod';

// Shipping Zone validators
export const createShippingZoneSchema = z.object({
  name: z.string().min(2).max(100),
  provinces: z.array(z.string()).min(1),
  excluded_postcodes: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true)
});

export const updateShippingZoneSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  provinces: z.array(z.string()).min(1).optional(),
  excluded_postcodes: z.array(z.string()).optional(),
  is_active: z.boolean().optional()
});

// Shipping Carrier validators
export const createShippingCarrierSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'Code must contain only lowercase letters, numbers, hyphens and underscores'),
  logo_url: z.string().url().optional(),
  is_active: z.boolean().optional().default(true),
  config: z.record(z.string(), z.any()).optional()
});

export const updateShippingCarrierSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'Code must contain only lowercase letters, numbers, hyphens and underscores').optional(),
  logo_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional()
});

// Shipping Rate validators
export const createShippingRateSchema = z.object({
  zone_id: z.string().uuid(),
  carrier_id: z.string().uuid(),
  min_amount: z.number().min(0),
  max_amount: z.number().min(0).optional(),
  price: z.number().min(0),
  estimated_days_min: z.number().int().min(1),
  estimated_days_max: z.number().int().min(1),
  is_active: z.boolean().optional().default(true)
}).refine(
  (data) => !data.max_amount || data.max_amount > data.min_amount,
  { message: 'max_amount debe ser mayor que min_amount', path: ['max_amount'] }
).refine(
  (data) => data.estimated_days_max >= data.estimated_days_min,
  { message: 'estimated_days_max debe ser mayor o igual a estimated_days_min', path: ['estimated_days_max'] }
);

export const updateShippingRateSchema = z.object({
  zone_id: z.string().uuid().optional(),
  carrier_id: z.string().uuid().optional(),
  min_amount: z.number().min(0).optional(),
  max_amount: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  estimated_days_min: z.number().int().min(1).optional(),
  estimated_days_max: z.number().int().min(1).optional(),
  is_active: z.boolean().optional()
});

// Quote validator
export const getShippingQuoteSchema = z.object({
  postcode: z.string().min(4).max(10),
  cart_total: z.number().min(0)
});

// Query validators
export const listShippingZonesSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  is_active: z.enum(['true', 'false']).optional()
});

export const listShippingCarriersSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  is_active: z.enum(['true', 'false']).optional()
});

export const listShippingRatesSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  zone_id: z.string().uuid().optional(),
  carrier_id: z.string().uuid().optional(),
  is_active: z.enum(['true', 'false']).optional()
});
