import { z } from 'zod';
import { normalizePhone } from '../../shared/utils/phone.js';

export const DELIVERY_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;
export const PAYMENT_METHODS = [
  'mercadopago',
  'transfer',
  'cash_on_delivery',
  'cash_pickup'
] as const;

// Texto opcional: trim y '' → null; omitido → null (el PUT reemplaza todo)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalAmount = z
  .number()
  .min(0)
  .max(9_999_999_999.99)
  .nullish()
  .transform((v) => v ?? null);

const optionalEnumArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .nullish()
    .transform((v) => (v && v.length > 0 ? [...new Set(v)] : null));

export const storeInfoSchema = z.object({
  business_hours: optionalText(2000),
  delivery_days: optionalEnumArray(DELIVERY_DAYS),
  delivery_zones: z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .nullish()
    .transform((v) => (v && v.length > 0 ? [...new Set(v)] : null)),
  minimum_order: optionalAmount,
  free_shipping_from: optionalAmount,
  payment_methods: optionalEnumArray(PAYMENT_METHODS),
  transfer_alias: optionalText(40),
  transfer_cbu: z
    .string()
    .trim()
    .regex(/^\d{22}$/, 'El CBU debe tener 22 dígitos')
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  transfer_holder: optionalText(100),
  transfer_bank: optionalText(60),
  pickup_address: optionalText(500),
  price_list_url: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((v) => v.startsWith('https://'), 'Debe ser una URL https')
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  contact_phone: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((v, ctx) => {
      if (!v) return null;
      const normalized = normalizePhone(v);
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'Teléfono inválido' });
        return z.NEVER;
      }
      return normalized;
    }),
  contact_email: z
    .string()
    .trim()
    .max(255)
    .email()
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => (v ? v.toLowerCase() : null)),
  additional_info: optionalText(5000)
});

export type StoreInfoInput = z.output<typeof storeInfoSchema>;
