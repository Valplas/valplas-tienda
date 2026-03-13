/**
 * Tipos compartidos para usuarios
 */

export type UserRole = 'owner' | 'admin' | 'driver' | 'customer';

export interface User {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  first_name: string;
  last_name: string | null;
  role: UserRole;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAddress {
  id: string;
  user_id: string;
  label: string;
  street: string;
  street_number: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  username?: string;
  phone?: string;
  first_name: string;
  last_name: string;
  password: string;
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}
