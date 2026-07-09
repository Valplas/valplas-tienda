import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

// Contraseñas comunes a bloquear (sin dependencia externa ni llamadas de red).
// Validación contra brechas reales (HIBP k-anonymity) queda en backlog. Ver OBS-19.
const COMMON_PASSWORDS = new Set([
  'password1234',
  'contraseña12',
  'qwertyuiop12',
  'administrador',
  'iloveyou1234',
  'welcome12345',
  'changeme1234',
  'valplas12345'
]);

/**
 * Política de contraseñas (OBS-19): mínimo 12 caracteres, con mayúscula, minúscula,
 * número y carácter especial, y bloqueo de contraseñas comunes.
 */
export const strongPasswordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(100, 'La contraseña no puede exceder 100 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial')
  .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase()), {
    message: 'La contraseña es demasiado común. Elegí una más segura.'
  });

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

  password: strongPasswordSchema,

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
