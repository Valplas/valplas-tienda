/**
 * Tipos compartidos para usuarios
 */

export type UserRole = 'owner' | 'admin' | 'driver' | 'customer';

export interface User {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  firstName: string;
  lastName: string | null;
  role: UserRole;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserAddress {
  id: string;
  userId: string;
  label: string;
  street: string;
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  username?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}
