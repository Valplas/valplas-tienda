import { z } from 'zod';
import { UserRole } from '@/types';

export const createUserSchema = z.object({
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guion bajo')
    .optional()
    .or(z.literal('')),
  firstName: z.string().min(2, 'Ingresá el nombre'),
  lastName: z.string().optional().or(z.literal('')),
  phone: z.string().regex(/^\+54\d{10,11}$/, 'Formato: +5491122334455'),
  role: z.nativeEnum(UserRole),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  isActive: z.boolean()
});

export const updateUserSchema = createUserSchema.extend({
  password: z.string().min(8).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+54\d{10,11}$/, 'Formato: +5491122334455')
    .optional()
    .or(z.literal(''))
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
