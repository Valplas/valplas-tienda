/**
 * Checkout Validation Schemas
 */

import { z } from 'zod';

/**
 * Address Schema
 */
export const addressSchema = z.object({
  label: z.string().min(1, 'Nombre para la dirección'),
  street: z.string().min(3, 'Ingresá la calle'),
  street_number: z.string().min(1, 'Ingresá el número'),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  city: z.string().min(2, 'Ingresá la ciudad'),
  province: z.string().min(2, 'Seleccioná la provincia'),
  postcode: z
    .string()
    .length(4, 'Código postal de 4 dígitos')
    .regex(/^\d{4}$/, 'Solo números'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  place_id: z.string().optional()
});

export type AddressFormData = z.infer<typeof addressSchema>;

/**
 * Shipping Option Schema
 */
export const shippingOptionSchema = z.object({
  carrier_name: z.string().min(1, 'Seleccioná un método de envío'),
  cost: z.number().min(0, 'Costo inválido'),
  estimated_days: z.number().min(1, 'Días estimados inválido')
});

export type ShippingOptionFormData = z.infer<typeof shippingOptionSchema>;

/**
 * Checkout Schema
 */
export const checkoutSchema = z.object({
  // Shipping address
  shipping_address_id: z.string().optional(),
  shipping_address: addressSchema.optional(),

  // Shipping method
  shipping_carrier: z.string().min(1, 'Seleccioná un método de envío'),

  // Payment
  payment_method: z.string().min(1, 'Seleccioná un método de pago'),

  // Contact info (for guest checkout - future iteration)
  contact_email: z.string().email('Email inválido').optional(),
  contact_phone: z
    .string()
    .regex(/^\+54\d{10,11}$/, 'Teléfono inválido')
    .optional(),

  // Delivery instructions
  delivery_notes: z.string().max(500, 'Máximo 500 caracteres').optional()
});

export type CheckoutFormData = z.infer<typeof checkoutSchema>;

/**
 * Order Status Update Schema (Admin)
 */
export const orderStatusUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  tracking_number: z.string().optional(),
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
  excluded_postcodes: z.array(z.string()).optional(),
  is_active: z.boolean().default(true)
});

export type ShippingZoneFormData = z.infer<typeof shippingZoneSchema>;

/**
 * Shipping Rate Schema (Admin)
 */
export const shippingRateSchema = z.object({
  zone_id: z.string().min(1, 'Zona requerida'),
  carrier_name: z.string().min(1, 'Nombre del carrier requerido'),
  min_amount: z.number().min(0, 'Monto mínimo inválido'),
  cost: z.number().min(0, 'Costo inválido'),
  estimated_days: z.number().min(1, 'Días estimados inválido'),
  is_active: z.boolean().default(true)
});

export type ShippingRateFormData = z.infer<typeof shippingRateSchema>;
