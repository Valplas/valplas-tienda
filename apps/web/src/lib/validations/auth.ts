/**
 * Auth Validation Schemas
 */

import { z } from 'zod';

/**
 * Política de contraseñas — debe coincidir con el backend (auth.validator.ts). Ver OBS-19.
 */
const strongPassword = z
  .string()
  .min(12, 'Mínimo 12 caracteres')
  .regex(/[A-Z]/, 'Debe contener una mayúscula')
  .regex(/[a-z]/, 'Debe contener una minúscula')
  .regex(/[0-9]/, 'Debe contener un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener un carácter especial');

/**
 * Login Schema
 */
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Ingresá tu email o usuario'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  rememberMe: z.boolean().optional()
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Register Schema
 */
export const registerSchema = z
  .object({
    email: z.string().email('Email inválido'),
    username: z
      .string()
      .min(3, 'Mínimo 3 caracteres')
      .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo')
      .optional()
      .or(z.literal('')),
    firstName: z.string().min(2, 'Ingresá tu nombre'),
    lastName: z.string().min(2, 'Ingresá tu apellido'),
    phone: z
      .string()
      .regex(/^\+54\d{10,11}$/, 'Teléfono inválido (ej: +5491122334455)')
      .optional()
      .or(z.literal('')),
    password: strongPassword,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword']
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Forgot Password Schema
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido')
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset Password Schema
 */
export const resetPasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword']
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

/**
 * Change Password Schema
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu contraseña actual'),
    newPassword: strongPassword,
    confirmPassword: z.string()
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword']
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
