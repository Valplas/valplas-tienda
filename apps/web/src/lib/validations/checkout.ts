/**
 * Checkout Validation Schemas
 */

import { z } from 'zod';

/**
 * Provincias de Argentina (alineado al enum del backend en address.validators.ts).
 * El backend valida `province` contra esta lista exacta.
 */
export const ARGENTINA_PROVINCES = [
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

/**
 * Address Schema
 */
export const addressSchema = z.object({
  label: z.string().min(1, 'Nombre para la dirección'),
  street: z.string().min(3, 'Ingresá la calle'),
  streetNumber: z.string().min(1, 'Ingresá el número'),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  city: z.string().min(2, 'Ingresá la ciudad'),
  province: z.string().min(2, 'Seleccioná la provincia'),
  postcode: z
    .string()
    .min(4, 'Código postal de 4 a 8 dígitos')
    .max(8, 'Código postal de 4 a 8 dígitos')
    .regex(/^\d{4,8}$/, 'Solo números'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  placeId: z.string().optional()
});

export type AddressFormData = z.infer<typeof addressSchema>;

/**
 * Shipping Option Schema
 */
export const shippingOptionSchema = z.object({
  carrierName: z.string().min(1, 'Seleccioná un método de envío'),
  cost: z.number().min(0, 'Costo inválido'),
  estimatedDays: z.number().min(1, 'Días estimados inválido')
});

export type ShippingOptionFormData = z.infer<typeof shippingOptionSchema>;

/**
 * Checkout Schema
 */
export const checkoutSchema = z.object({
  // Shipping address
  shippingAddressId: z.string().optional(),
  shippingAddress: addressSchema.optional(),

  // Shipping method
  shippingCarrier: z.string().min(1, 'Seleccioná un método de envío'),

  // Payment
  paymentMethod: z.string().min(1, 'Seleccioná un método de pago'),

  // Contact info (for guest checkout - future iteration)
  contactEmail: z.string().email('Email inválido').optional(),
  contactPhone: z
    .string()
    .regex(/^\+54\d{10,11}$/, 'Teléfono inválido')
    .optional(),

  // Delivery instructions
  deliveryNotes: z.string().max(500, 'Máximo 500 caracteres').optional()
});

export type CheckoutFormData = z.infer<typeof checkoutSchema>;

/**
 * Order Status Update Schema (Admin)
 */
export const orderStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  trackingNumber: z.string().optional(),
  notes: z.string().max(500, 'Máximo 500 caracteres').optional()
});

export type OrderStatusUpdateFormData = z.infer<typeof orderStatusUpdateSchema>;

/**
 * Shipping Zone Schema (Admin)
 */
export const shippingZoneSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  province: z.string().min(2, 'Provincia requerida'),
  postcodes: z.array(z.string()).min(1, 'Al menos un rango de CP requerido'),
  excludedPostcodes: z.array(z.string()).optional(),
  isActive: z.boolean().default(true)
});

export type ShippingZoneFormData = z.infer<typeof shippingZoneSchema>;

/**
 * Shipping Rate Schema (Admin)
 */
export const shippingRateSchema = z.object({
  zoneId: z.string().min(1, 'Zona requerida'),
  carrierName: z.string().min(1, 'Nombre del carrier requerido'),
  minAmount: z.number().min(0, 'Monto mínimo inválido'),
  cost: z.number().min(0, 'Costo inválido'),
  estimatedDays: z.number().min(1, 'Días estimados inválido'),
  isActive: z.boolean().default(true)
});

export type ShippingRateFormData = z.infer<typeof shippingRateSchema>;
