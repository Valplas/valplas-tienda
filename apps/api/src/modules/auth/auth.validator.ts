import { z } from 'zod';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Esquema de validación para registro
 */
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('Email inválido')
    .max(255, 'Email demasiado largo'),

  username: z
    .string()
    .min(3, 'El username debe tener al menos 3 caracteres')
    .max(50, 'El username no puede exceder 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'El username solo puede contener letras, números y guiones bajos'),

  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'La contraseña no puede exceder 100 caracteres')
    .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),

  firstName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  lastName: z
    .string()
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(100, 'El apellido no puede exceder 100 caracteres'),

  phone: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true; // Opcional
        try {
          // Validar formato E.164
          return isValidPhoneNumber(val, 'AR');
        } catch {
          return false;
        }
      },
      {
        message: 'Teléfono inválido. Debe estar en formato E.164 (ej: +5491122334455)'
      }
    )
});

/**
 * Esquema de validación para login
 */
export const loginSchema = z.object({
  emailOrUsername: z
    .string()
    .min(1, 'Email o username es requerido')
    .max(255, 'Email o username demasiado largo'),

  password: z.string().min(1, 'La contraseña es requerida')
});

/**
 * Tipos inferidos de los schemas
 */
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
