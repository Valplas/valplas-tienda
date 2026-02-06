// apps/api/src/modules/addresses/address.validators.ts

import { z } from 'zod';

// Provincias de Argentina
const ARGENTINA_PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán'
] as const;

export const createAddressSchema = z.object({
  alias: z.string().min(2).max(50),
  street: z.string().min(2).max(100),
  street_number: z.string().min(1).max(10),
  floor: z.string().max(10).optional(),
  apartment: z.string().max(10).optional(),
  city: z.string().min(2).max(100),
  province: z.enum(ARGENTINA_PROVINCES as unknown as [string, ...string[]]),
  postcode: z
    .string()
    .min(4)
    .max(8)
    .regex(/^\d{4,8}$/),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  place_id: z.string().optional(),
  is_default: z.boolean().optional().default(false)
});

export const updateAddressSchema = z.object({
  alias: z.string().min(2).max(50).optional(),
  street: z.string().min(2).max(100).optional(),
  street_number: z.string().min(1).max(10).optional(),
  floor: z.string().max(10).optional(),
  apartment: z.string().max(10).optional(),
  city: z.string().min(2).max(100).optional(),
  province: z.enum(ARGENTINA_PROVINCES as unknown as [string, ...string[]]).optional(),
  postcode: z
    .string()
    .min(4)
    .max(8)
    .regex(/^\d{4,8}$/)
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  place_id: z.string().optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional()
});

export const listAddressesSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  is_default: z.enum(['true', 'false']).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  province: z.string().optional(),
  city: z.string().optional()
});

// Para admins que quieran filtrar por usuario
export const adminListAddressesSchema = listAddressesSchema.extend({
  user_id: z.string().uuid().optional()
});
