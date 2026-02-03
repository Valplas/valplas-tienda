// apps/api/src/modules/users/user.validators.ts

import { z } from 'zod';

const USER_ROLES = ['owner', 'admin', 'driver', 'customer'] as const;

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8),
  phone: z.string().min(10).max(20).optional(),
  first_name: z.string().min(2).max(100),
  last_name: z.string().min(2).max(100),
  role: z.enum(USER_ROLES),
  is_active: z.boolean().optional().default(true)
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  phone: z.string().min(10).max(20).optional(),
  first_name: z.string().min(2).max(100).optional(),
  last_name: z.string().min(2).max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  is_active: z.boolean().optional(),
  email_verified: z.boolean().optional(),
  phone_verified: z.boolean().optional()
});

export const updateUserPasswordSchema = z.object({
  new_password: z.string().min(8)
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  role: z.enum(USER_ROLES).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  email_verified: z.enum(['true', 'false']).optional(),
  search: z.string().optional()
});
